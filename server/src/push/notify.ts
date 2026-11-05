import { one, query } from '../db.js';
import { eurRate, moneyFormatter } from '../fx.js';
import { dropThreshold } from './alerts.js';
import { sendPushToUser, type PushMessage } from './push.js';

/*
 * Phone notifications for Oglasi (app 1.2): messages, followed ads, the owner's own ads and new ads for
 * watched sets. Each kind can be switched off on the account page (users.push_prefs); nothing here
 * may ever fail the request that caused it, so callers use notifySafely().
 */

/** Kinds of notifications the person can switch on and off; "prices" are the watched sets (push/alerts.ts) */
export const PUSH_KINDS = ['prices', 'messages', 'watched_ads', 'my_ads', 'new_ads'] as const;
export type PushKind = (typeof PUSH_KINDS)[number];
export type PushPrefs = Partial<Record<PushKind, boolean>>;

/** A missing choice means "yes" */
export const wants = (prefs: PushPrefs | null | undefined, kind: PushKind) => prefs?.[kind] !== false;

/** For tests: wait for the notifications started by a request */
const running = new Set<Promise<unknown>>();
export async function settleNotifications() {
  while (running.size) await Promise.allSettled([...running]);
}

/** Runs a notification in the background; an error is only logged */
export function notifySafely(p: () => Promise<unknown>, log: (e: unknown) => void = (e) => console.warn(`obaveštenja: ${(e as Error)?.message ?? e}`)) {
  const run = p().catch(log);
  running.add(run);
  void run.finally(() => running.delete(run));
}

/** Sends if the person has a device for it and didn't switch this kind off; returns how many devices got it */
export async function notifyUser(userId: number, kind: PushKind, msg: PushMessage): Promise<number> {
  const u = await one<{ push_prefs: PushPrefs }>(
    'SELECT push_prefs FROM users WHERE id = $1 AND EXISTS (SELECT 1 FROM push_subscriptions p WHERE p.user_id = users.id)',
    [userId],
  );
  if (!u || !wants(u.push_prefs, kind)) return 0;
  return (await sendPushToUser(userId, msg)).sent;
}

/** Either of the two blocked the other */
export async function blockedEitherWay(a: number, b: number): Promise<boolean> {
  return !!(await one('SELECT 1 FROM user_blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)', [a, b]));
}

const snippet = (s: string, n: number) => {
  const v = s.replace(/\s+/g, ' ').trim();
  return v.length > n ? `${v.slice(0, n - 1)}…` : v;
};

// ---- the texts (pure, so they can be tested) ----

export function messagePush(o: { conversationId: number; from: string; adTitle: string; text: string }): PushMessage {
  return {
    title: `${o.from || 'Korisnik'} · ${snippet(o.adTitle, 40)}`,
    body: snippet(o.text, 140),
    url: `/poruke/${o.conversationId}`,
    tag: `conv-${o.conversationId}`,
    channel: 'poruke',
  };
}

export function watchedAdPush(o: { id: number; title: string } & ({ kind: 'drop'; price: string; was: string } | { kind: 'sold' })): PushMessage {
  const base = { url: `/oglasi/${o.id}`, tag: `ad-${o.id}`, channel: 'oglasi' as const };
  if (o.kind === 'sold') return { ...base, title: `Prodato: ${snippet(o.title, 60)}`, body: 'Oglas koji pratiš je označen kao prodat.' };
  return { ...base, title: `Pojeftinio oglas: ${snippet(o.title, 50)}`, body: `Sada ${o.price}, ranije ${o.was}.` };
}

const COND: Record<string, string> = {
  like_new: 'kao novo',
  used_complete: 'korišćeno, kompletno',
  used_incomplete: 'korišćeno, nekompletno',
  parts: 'delovi i figurice',
};

export function newAdPush(o: { id: number; setName: string; setNum: string; price: string; city: string; condition: string }): PushMessage {
  return {
    title: `Novi oglas: ${snippet(o.setName, 50)} (${o.setNum})`,
    body: `${o.price} · ${o.city} · ${COND[o.condition] ?? 'korišćeno'}. Set je na tvojoj listi za praćenje.`,
    url: `/oglasi/${o.id}`,
    tag: `ad-${o.id}`,
    channel: 'oglasi',
  };
}

export type OwnerEvent = { kind: 'expiring'; daysLeft: number } | { kind: 'expired' } | { kind: 'removed'; reason: string };

export function ownerPush(o: { id: number; title: string } & OwnerEvent): PushMessage {
  const t = snippet(o.title, 60);
  const base = { tag: `my-ad-${o.id}`, channel: 'oglasi' as const };
  if (o.kind === 'expiring') {
    const days = o.daysLeft === 1 ? 'sutra' : `za ${o.daysLeft} dana`;
    return { ...base, url: '/moji-oglasi', title: `Oglas ističe ${days}`, body: `„${t}”. Produži ga jednim dodirom da ostane vidljiv.` };
  }
  if (o.kind === 'expired') return { ...base, url: '/moji-oglasi', title: 'Oglas je istekao', body: `„${t}” se više ne prikazuje. Možeš da ga obnoviš u narednih 30 dana.` };
  return { ...base, url: `/oglasi/${o.id}`, title: 'Oglas je uklonjen', body: `„${t}”: ${snippet(o.reason, 100)}` };
}

// ---- events ----

async function formatterFor(currency: 'RSD' | 'EUR') {
  return moneyFormatter(currency, currency === 'EUR' ? (await eurRate()).rate : 0);
}

/** Someone wrote in a conversation: the other person gets it on the phone (unless they switched messages off) */
export async function notifyNewMessage(o: { conversationId: number; recipientId: number; senderId: number; from: string; adTitle: string; text: string }) {
  if (await blockedEitherWay(o.recipientId, o.senderId)) return 0;
  return notifyUser(o.recipientId, 'messages', messagePush(o));
}

/**
 * A followed ad got cheaper or was sold: its followers hear about it. A drop counts from the lowest price
 * a notification already went out for (or the price they followed it at), with the same 2% / 100 RSD
 * threshold as the watched sets, so a seller nudging the price up and down doesn't spam anybody.
 */
export async function notifyAdFollowers(listingId: number, change: 'price' | 'sold') {
  const l = await one<{ id: number; user_id: number; title: string; price_rsd: number; status: string }>('SELECT id, user_id, title, price_rsd, status FROM listings WHERE id = $1', [listingId]);
  if (!l) return 0;
  const watchers = await query<{ user_id: number; seen_price: number; pushed_price: number | null; currency: 'RSD' | 'EUR' }>(
    `SELECT w.user_id, w.seen_price, w.pushed_price, u.currency FROM listing_watches w JOIN users u ON u.id = w.user_id
      WHERE w.listing_id = $1 AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE b.blocker_id = w.user_id AND b.blocked_id = $2)`,
    [l.id, l.user_id],
  );
  let sent = 0;
  for (const w of watchers) {
    if (change === 'sold') {
      if (l.status === 'sold') sent += await notifyUser(w.user_id, 'watched_ads', watchedAdPush({ id: l.id, title: l.title, kind: 'sold' }));
      continue;
    }
    const ref = Math.min(w.seen_price, w.pushed_price ?? w.seen_price);
    if (l.status !== 'active' || ref - l.price_rsd < dropThreshold(ref)) continue;
    await query('UPDATE listing_watches SET pushed_price = $3 WHERE user_id = $1 AND listing_id = $2', [w.user_id, l.id, l.price_rsd]);
    const fmt = await formatterFor(w.currency);
    sent += await notifyUser(w.user_id, 'watched_ads', watchedAdPush({ id: l.id, title: l.title, kind: 'drop', price: fmt(l.price_rsd), was: fmt(ref) }));
  }
  return sent;
}

/** A new active ad for a set people watch: each of them hears about it once (never the seller, never someone who blocked them) */
export async function notifySetWatchers(listingId: number) {
  const l = await one<{ id: number; user_id: number; title: string; set_num: string | null; price_rsd: number; city: string; condition: string; set_name: string | null }>(
    `UPDATE listings l SET set_alerted = true WHERE l.id = $1 AND l.status = 'active' AND NOT l.set_alerted AND l.set_num IS NOT NULL
     RETURNING l.id, l.user_id, l.title, l.set_num, l.price_rsd, l.city, l.condition, (SELECT s.name FROM sets s WHERE s.set_num = l.set_num) AS set_name`,
    [listingId],
  );
  if (!l?.set_num) return 0;
  const watchers = await query<{ user_id: number; currency: 'RSD' | 'EUR' }>(
    `SELECT w.user_id, u.currency FROM watchlist w JOIN users u ON u.id = w.user_id
      WHERE w.set_num = $1 AND w.user_id <> $2
        AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE b.blocker_id = w.user_id AND b.blocked_id = $2)`,
    [l.set_num, l.user_id],
  );
  let sent = 0;
  for (const w of watchers) {
    const fmt = await formatterFor(w.currency);
    sent += await notifyUser(w.user_id, 'new_ads', newAdPush({ id: l.id, setName: l.set_name ?? l.title, setNum: l.set_num, price: fmt(l.price_rsd), city: l.city, condition: l.condition }));
  }
  return sent;
}

/** The owner's own ad: running out, ran out, or taken down by a moderator */
export async function notifyOwner(listingId: number, ev: OwnerEvent) {
  const l = await one<{ id: number; user_id: number; title: string }>('SELECT id, user_id, title FROM listings WHERE id = $1', [listingId]);
  if (!l) return 0;
  return notifyUser(l.user_id, 'my_ads', ownerPush({ id: l.id, title: l.title, ...ev }));
}

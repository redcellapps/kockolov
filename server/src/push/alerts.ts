import { query } from '../db.js';
import { eurRate, moneyFormatter } from '../fx.js';
import { shopLabel } from '../mail/format.js';
import { sendPushToUser, type PushMessage } from './push.js';

/** Smallest drop worth a notification: 2% of the price, and at least 100 dinars */
export function dropThreshold(price: number): number {
  return Math.max(100, Math.ceil(price * 0.02));
}

export interface WatchState {
  user_id: number;
  set_num: string;
  name: string;
  image_url: string | null;
  /** today's best in-stock price over all shops (signed-in users see members-only shops too) */
  price: number | null;
  shop_id: string | null;
  seller: string | null;
  seen_price: number | null;
  seen_in_stock: boolean | null;
}

export type WatchEvent =
  | { kind: 'drop'; row: WatchState; price: number; was: number }
  | { kind: 'back'; row: WatchState; price: number };

/** What happened to one watched set since the watcher was last told (null = nothing worth a message). */
export function watchEvent(r: WatchState): WatchEvent | null {
  if (r.price === null || r.seen_in_stock === null) return null;
  if (r.seen_in_stock === false) return { kind: 'back', row: r, price: r.price };
  if (r.seen_price !== null && r.seen_price - r.price >= dropThreshold(r.seen_price)) {
    return { kind: 'drop', row: r, price: r.price, was: r.seen_price };
  }
  return null;
}

/** "set" / "seta" / "setova" */
export function setovi(n: number): string {
  const d = n % 10;
  const dd = n % 100;
  if (d === 1 && dd !== 11) return `${n} set`;
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return `${n} seta`;
  return `${n} setova`;
}

const absUrl = (u: string | null) => (u && /^https:\/\//.test(u) ? u : undefined);

/** Text of the notifications for one user: up to three sets one by one, more as one summary. */
export function alertMessages(events: WatchEvent[], money: (n: number) => string): PushMessage[] {
  if (events.length > 3) {
    const names = events.slice(0, 3).map((e) => e.row.name);
    return [{ title: `Praćeno: nove cene za ${setovi(events.length)}`, body: `${names.join(', ')} i još ${events.length - 3}.`, url: '/pracenje', tag: 'pracenje' }];
  }
  return events.map((e) => {
    const shop = shopLabel(e.row.shop_id ?? '', e.row.seller);
    const base = { url: `/set/${encodeURIComponent(e.row.set_num)}`, tag: `set-${e.row.set_num}`, icon: absUrl(e.row.image_url) };
    if (e.kind === 'back') {
      return { ...base, title: `Ponovo na stanju: ${e.row.name}`, body: `${money(e.price)} · ${shop}` };
    }
    const pct = Math.round((100 * (e.was - e.price)) / e.was);
    return {
      ...base,
      title: `Pojeftinio: ${e.row.name}`,
      body: `Sada ${money(e.price)} · ${shop}. Ranije ${money(e.was)} (−${pct}%).`,
    };
  });
}

/**
 * After the morning crawl: tells everyone with notifications on which of their watched sets got cheaper
 * or came back in stock, then remembers today's prices for the next comparison (for every watcher,
 * so someone who turns notifications on later doesn't get news about months-old prices).
 */
export async function sendWatchAlerts(opts: { log?: (m: string) => void; dryRun?: boolean } = {}) {
  const log = opts.log ?? console.log;
  const rows = await query<WatchState>(
    `SELECT w.user_id, w.set_num, s.name, s.image_url, w.seen_price, w.seen_in_stock,
            b.price_rsd AS price, b.shop_id, b.seller
       FROM watchlist w JOIN sets s ON s.set_num = w.set_num
       LEFT JOIN LATERAL (
         SELECT price_rsd, shop_id, seller FROM offers o
          WHERE o.set_num = w.set_num AND o.active AND o.in_stock ORDER BY price_rsd, shop_id LIMIT 1
       ) b ON true
      ORDER BY w.user_id, s.name`,
  );
  const byUser = new Map<number, WatchEvent[]>();
  for (const r of rows) {
    const e = watchEvent(r);
    if (e) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), e]);
  }

  const users = byUser.size
    ? await query<{ id: number; currency: 'RSD' | 'EUR' }>(
        `SELECT u.id, u.currency FROM users u WHERE u.id = ANY($1::bigint[])
            AND EXISTS (SELECT 1 FROM push_subscriptions p WHERE p.user_id = u.id)`,
        [[...byUser.keys()]],
      )
    : [];
  const rate = users.some((u) => u.currency === 'EUR') ? (await eurRate()).rate : 0;
  const totals = { users: 0, messages: 0, devices: 0, gone: 0, failed: 0 };
  for (const u of users) {
    const fmt = moneyFormatter(u.currency, rate);
    const msgs = alertMessages(byUser.get(u.id)!, (n) => fmt(n));
    totals.users++;
    for (const m of msgs) {
      if (opts.dryRun) {
        log(`obaveštenja (proba) → korisnik ${u.id}: ${m.title} — ${m.body}`);
        continue;
      }
      const r = await sendPushToUser(u.id, m);
      totals.messages++;
      totals.devices += r.sent;
      totals.gone += r.gone;
      totals.failed += r.failed;
    }
  }

  if (!opts.dryRun) {
    // remember today's state; the price stays the last in-stock one while a set is sold out
    await query(
      `UPDATE watchlist w SET seen_in_stock = x.in_stock, seen_price = coalesce(x.price, w.seen_price)
         FROM unnest($1::bigint[], $2::text[], $3::int[], $4::boolean[]) AS x(user_id, set_num, price, in_stock)
        WHERE w.user_id = x.user_id AND w.set_num = x.set_num
          AND (w.seen_in_stock IS DISTINCT FROM x.in_stock OR (x.price IS NOT NULL AND w.seen_price IS DISTINCT FROM x.price))`,
      [rows.map((r) => r.user_id), rows.map((r) => r.set_num), rows.map((r) => r.price), rows.map((r) => r.price !== null)],
    );
  }
  log(
    `obaveštenja: ${totals.users} korisnika, ${totals.messages} poruka, isporučeno na ${totals.devices} uređaja` +
      (totals.gone ? `, ${totals.gone} uređaja više ne postoji` : '') +
      (totals.failed ? `, ${totals.failed} neuspelih` : ''),
  );
  return totals;
}

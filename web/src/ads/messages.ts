// PROTOTYPE: conversations between buyers and sellers, kept in this browser only. The "other person" is simulated:
// a reply arrives a few seconds after you write, so unread badges and the e-mail notification can be tried by one person.
// The real version stores this on the server and sends the e-mail through server/src/mail.
import { useSyncExternalStore } from 'react';
import type { Listing } from './store';

export interface Msg {
  id: string;
  from: 'me' | 'them';
  text: string;
  at: string;
}
export interface Conversation {
  id: string;
  listing_id: string;
  listing_title: string;
  listing_image: string;
  listing_price: number;
  other: string;
  /** true when the ad is mine and the other person is a buyer */
  my_ad: boolean;
  messages: Msg[];
  unread: number;
  reported: boolean;
}
export interface Email {
  id: string;
  conv_id: string;
  subject: string;
  body: string;
  at: string;
}

const KEY = 'kockolov.proto.conversations.v1';
const MAIL_KEY = 'kockolov.proto.outbox.v1';
const PREF_KEY = 'kockolov.proto.msgprefs.v1';
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

const SEED: Conversation[] = [
  {
    id: 'c1',
    listing_id: 'a7',
    listing_title: 'LEGO Friends 41700 kućica, kompletna',
    listing_image: '',
    listing_price: 3200,
    other: 'Petar T.',
    my_ad: true,
    unread: 1,
    reported: false,
    messages: [{ id: 'm1', from: 'them', text: 'Zdravo, da li je set još dostupan? Mogu da ga preuzmem u subotu u Nišu.', at: ago(25) }],
  },
];

const SEED_MAILS: Email[] = [
  {
    id: 'e1',
    conv_id: 'c1',
    subject: 'Petar T. ti je poslao poruku za oglas „LEGO Friends 41700 kućica, kompletna”',
    body: 'Zdravo, da li je set još dostupan? Mogu da ga preuzmem u subotu u Nišu.\n\nOdgovori na Kockolovu: kockolov.rs/poruke/c1\n\nNe odgovaraj na ovaj mejl, odgovor se piše na sajtu. Ne želiš ove mejlove? Isključi ih u podešavanjima naloga.',
    at: ago(25),
  },
];

const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const subscribe = (f: () => void) => (subs.add(f), () => void subs.delete(f));

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* private mode or full: keep working for this visit */
  }
}

// cache by raw string so useSyncExternalStore gets a stable reference
function cached<T>(key: string, fallback: T) {
  let raw: string | null | undefined;
  let val = fallback;
  return () => {
    let now: string | null = null;
    try {
      now = localStorage.getItem(key);
    } catch {
      /* ignore */
    }
    if (now !== raw) {
      raw = now;
      val = now ? (JSON.parse(now) as T) : fallback;
    }
    return val;
  };
}
const getConvs = cached<Conversation[]>(KEY, SEED);
const getMails = cached<Email[]>(MAIL_KEY, SEED_MAILS);
const getPrefs = cached<{ emailOnMessage: boolean }>(PREF_KEY, { emailOnMessage: true });

export const useConversations = () => useSyncExternalStore(subscribe, getConvs);
export const useOutbox = () => useSyncExternalStore(subscribe, getMails);
export const useMsgPrefs = () => useSyncExternalStore(subscribe, getPrefs);
export const useUnread = () => useConversations().reduce((n, c) => n + c.unread, 0);

const saveConvs = (c: Conversation[]) => (write(KEY, c), emit());
export function setEmailOnMessage(v: boolean) {
  write(PREF_KEY, { emailOnMessage: v });
  emit();
}
export const resetMessages = () => {
  write(KEY, SEED);
  write(MAIL_KEY, SEED_MAILS);
  emit();
};

const uid = () => Math.random().toString(36).slice(2, 9);

/** Opens (or creates) the buyer's conversation about an ad */
export function conversationFor(l: Listing): string {
  const all = getConvs();
  const found = all.find((c) => c.listing_id === l.id && !c.my_ad);
  if (found) return found.id;
  const id = `c${uid()}`;
  saveConvs([...all, { id, listing_id: l.id, listing_title: l.title, listing_image: l.images[0] ?? '', listing_price: l.price_rsd, other: l.seller, my_ad: false, messages: [], unread: 0, reported: false }]);
  return id;
}

/** What the e-mail to the recipient would say (shown in the simulated outbox) */
function addEmail(c: Conversation, text: string) {
  if (!getPrefs().emailOnMessage) return;
  const mail: Email = {
    id: uid(),
    conv_id: c.id,
    subject: `${c.other} ti je poslao poruku za oglas „${c.listing_title}”`,
    body: `${text.length > 160 ? text.slice(0, 157) + '…' : text}\n\nOdgovori na Kockolovu: kockolov.rs/poruke/${c.id}\n\nNe odgovaraj na ovaj mejl, odgovor se piše na sajtu. Ne želiš ove mejlove? Isključi ih u podešavanjima naloga.`,
    at: new Date().toISOString(),
  };
  write(MAIL_KEY, [mail, ...getMails()].slice(0, 30));
}

const REPLY_SELLER = ['Zdravo! Da, još je dostupno. Može preuzimanje lično, javi kad ti odgovara.', 'Hvala na interesovanju. Cena je skoro krajnja, ali možemo da se dogovorimo oko preuzimanja.', 'Naravno, mogu da pošaljem još fotografija ako želiš.'];
const REPLY_BUYER = ['Super, hvala! Javim se još danas.', 'Može, a da li si spreman da spustiš cenu malo?', 'Dogovoreno, preuzimam u subotu.'];

export function sendMessage(convId: string, text: string) {
  const t = text.trim();
  if (!t) return;
  saveConvs(getConvs().map((c) => (c.id === convId ? { ...c, messages: [...c.messages, { id: uid(), from: 'me', text: t, at: new Date().toISOString() }] } : c)));
  // simulated answer after a few seconds, so the incoming flow (badge + e-mail) can be tested
  setTimeout(() => {
    const cs = getConvs();
    const c = cs.find((x) => x.id === convId);
    if (!c) return;
    const pool = c.my_ad ? REPLY_BUYER : REPLY_SELLER;
    const reply = pool[c.messages.length % pool.length];
    saveConvs(cs.map((x) => (x.id === convId ? { ...x, unread: x.unread + 1, messages: [...x.messages, { id: uid(), from: 'them', text: reply, at: new Date().toISOString() }] } : x)));
    addEmail(c, reply);
    emit();
  }, 5000);
}

export function markRead(convId: string) {
  const cs = getConvs();
  if (cs.some((c) => c.id === convId && c.unread)) saveConvs(cs.map((c) => (c.id === convId ? { ...c, unread: 0 } : c)));
}
export const reportConversation = (id: string) => saveConvs(getConvs().map((c) => (c.id === id ? { ...c, reported: true } : c)));

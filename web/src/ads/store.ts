// PROTOTYPE (phase 0): classifieds data lives in this browser's localStorage only — no server, nothing is shared.
// The real version replaces this file with API calls (/api/oglasi/*); pages and components stay as they are.
import { resetMessages } from './messages';
import { useSyncExternalStore } from 'react';

/** Private persons sell used items only (no fiscal receipts), so there is no "new" condition */
export type Condition = 'like_new' | 'used_complete' | 'used_incomplete' | 'parts';
export const CONDITIONS: Condition[] = ['like_new', 'used_complete', 'used_incomplete', 'parts'];

export interface Listing {
  id: string;
  title: string;
  description: string;
  set_num: string | null;
  theme_slug: string | null;
  theme_name: string | null;
  condition: Condition;
  has_box: boolean;
  has_manual: boolean;
  price_rsd: number;
  /** earlier prices, oldest first (the last one before price_rsd is what the price dropped from) */
  price_history: { price: number; at: string }[];
  negotiable: boolean;
  city: string;
  shipping: 'pickup' | 'ships';
  year: number | null;
  pieces: number | null;
  minifigs: number | null;
  images: string[];
  seller: string;
  seller_since: string;
  seller_phone: string | null;
  mine: boolean;
  status: 'active' | 'paused' | 'sold';
  created_at: string;
  views: number;
}

const KEY = 'kockolov.proto.listings.v7';
const PHONE_KEY = 'kockolov.proto.phone';
const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

/** Colored brick placeholder photo (4:3, with the Kockolov mark), so seed listings have a picture without any file */
function brick(c1: string, c2: string, label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="${c2}"/><g fill="${c1}"><rect x="90" y="110" width="220" height="110" rx="12"/><rect x="115" y="80" width="46" height="32" rx="9"/><rect x="177" y="80" width="46" height="32" rx="9"/><rect x="239" y="80" width="46" height="32" rx="9"/></g><rect x="90" y="190" width="220" height="30" rx="12" fill="rgba(0,0,0,.12)"/><text x="200" y="252" text-anchor="middle" font-family="sans-serif" font-weight="800" font-size="22" fill="rgba(0,0,0,.45)">${label}</text><rect x="288" y="262" width="104" height="28" rx="14" fill="rgba(22,21,15,.72)"/><rect x="298" y="270" width="16" height="12" rx="3" fill="#ffcf00"/><text x="320" y="281" font-family="sans-serif" font-weight="800" font-size="13" fill="#fff">Kockolov</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const SEED_RAW = [
  { id: 'a1', title: 'Millennium Falcon UCS, kompletan sa kutijom', description: 'Sklopljen jednom, stajao u vitrini. Sve kesice su unutra, uputstvo i kutija u odličnom stanju. Lično preuzimanje u Beogradu, može provera pred kupovinu.', set_num: '75192', theme_slug: 'star-wars', theme_name: 'Star Wars', condition: 'used_complete', has_box: true, has_manual: true, price_rsd: 58000, negotiable: true, city: 'Beograd', images: [brick('#6b7280', '#e5e7eb', '75192')], seller: 'Nikola M.', seller_since: '2026-09-02', seller_phone: '+381 64 111 2233', mine: false, status: 'active', created_at: day(1), views: 142 },
  { id: 'a2', title: 'Buket ruža 10328, kao nov, sa kutijom', description: 'Sklopljen jednom i stajao u vitrini, izgleda kao nov. Kutija i uputstvo su sačuvani.', set_num: '10328', theme_slug: 'botanicals', theme_name: 'Botanicals', condition: 'like_new', has_box: true, has_manual: true, price_rsd: 4900, negotiable: false, city: 'Novi Sad', images: [brick('#e11d48', '#ffe4e6', '10328')], seller: 'Jelena P.', seller_since: '2026-10-11', seller_phone: '+381 63 222 3344', mine: false, status: 'active', created_at: day(0), views: 57 },
  { id: 'a3', title: 'Lot: 12 Technic setova, bez kutija', description: 'Prodaje se zajedno ili pojedinačno (pitajte). Sve proverene po delovima, nedostaje nekoliko stikera.', set_num: null, theme_slug: 'technic', theme_name: 'Technic', condition: 'used_incomplete', has_box: false, has_manual: false, price_rsd: 24000, negotiable: true, city: 'Niš', images: [brick('#cf1419', '#fee2e2', 'TECHNIC')], seller: 'Marko D.', seller_since: '2026-08-20', seller_phone: null, mine: false, status: 'active', created_at: day(3), views: 211 },
  { id: 'a4', title: 'Hogwarts dvorac 71043 – kompletan, sa kutijom', description: 'Sklopljen jednom, sve kesice na broju. Kutija ima malo istrošenih ivica.', set_num: '71043', theme_slug: 'harry-potter', theme_name: 'Harry Potter', condition: 'used_complete', has_box: true, has_manual: true, price_rsd: 47000, negotiable: true, city: 'Beograd', images: [brick('#7c3aed', '#ede9fe', '71043')], seller: 'Ana S.', seller_since: '2026-07-14', seller_phone: '+381 65 333 4455', mine: false, status: 'active', created_at: day(5), views: 98 },
  { id: 'a5', title: 'Kesa figurica: 40 komada, Ninjago i City', description: 'Čiste, bez oštećenja štampe. Šaljem Postexpressom uz plaćanje pouzećem.', set_num: null, theme_slug: 'ninjago', theme_name: 'Ninjago', condition: 'parts', has_box: false, has_manual: false, price_rsd: 6500, negotiable: false, city: 'Kragujevac', images: [brick('#16a34a', '#dcfce7', 'FIGURICE')], seller: 'Stefan R.', seller_since: '2026-10-02', seller_phone: '+381 60 444 5566', mine: false, status: 'active', created_at: day(8), views: 33 },
  { id: 'a6', title: 'Monster Jam DIGatron 42199, sklopljen', description: 'Sve radi, povlačenje na nazad. Nedostaje kutija.', set_num: '42199', theme_slug: 'technic', theme_name: 'Technic', condition: 'used_complete', has_box: false, has_manual: true, price_rsd: 2700, negotiable: true, city: 'Subotica', images: [brick('#0ea5e9', '#e0f2fe', '42199')], seller: 'Dejan K.', seller_since: '2026-06-30', seller_phone: '+381 64 555 6677', mine: false, status: 'active', created_at: day(11), views: 120 },
  { id: 'a7', title: 'LEGO Friends 41700 kućica, kompletna', description: 'Kompletna kućica sa svim figuricama. Čuvana u kutiji, bez oštećenja.', set_num: '41700', theme_slug: 'friends', theme_name: 'Friends', condition: 'like_new', has_box: true, has_manual: true, price_rsd: 3200, negotiable: true, city: 'Niš', images: [brick('#ec4899', '#fce7f3', '41700')], seller: 'Ja', seller_since: '2026-11-01', seller_phone: null, mine: true, status: 'active', created_at: day(0), views: 12 },
] as unknown as Omit<Listing, 'price_history' | 'shipping' | 'year' | 'pieces' | 'minifigs'>[];

const EXTRA: Record<string, Partial<Listing>> = {
  a1: { year: 2017, pieces: 7541, minifigs: 8, shipping: 'pickup' },
  a2: { year: 2025, pieces: 822, shipping: 'ships' },
  a3: { shipping: 'ships', price_history: [{ price: 28000, at: day(6) }] },
  a4: { year: 2018, pieces: 6020, minifigs: 27, shipping: 'pickup' },
  a5: { minifigs: 40, shipping: 'ships' },
  a6: { year: 2022, pieces: 220, shipping: 'ships' },
};
const SEED: Listing[] = SEED_RAW.map((l) => ({ price_history: [], shipping: 'pickup', year: null, pieces: null, minifigs: null, ...l, ...EXTRA[l.id] }) as Listing);

let cache: Listing[] | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

function load(): Listing[] {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as Listing[]) : [...SEED];
  } catch {
    cache = [...SEED];
  }
  return cache;
}
function save(next: Listing[]) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode or full: the prototype keeps working for this visit */
  }
  emit();
}

const snapshot = () => load();
const subscribe = (f: () => void) => (subs.add(f), () => void subs.delete(f));
export const useListings = () => useSyncExternalStore(subscribe, snapshot);

export function addListing(l: Omit<Listing, 'id' | 'created_at' | 'views' | 'mine' | 'status'>): string {
  const id = `u${Date.now().toString(36)}`;
  save([{ ...l, id, created_at: new Date().toISOString(), views: 0, mine: true, status: 'active' }, ...load()]);
  return id;
}
export const updateListing = (id: string, patch: Partial<Listing>) => save(load().map((l) => (l.id === id ? { ...l, ...patch } : l)));
export const removeListing = (id: string) => save(load().filter((l) => l.id !== id));
export const resetPrototype = () => {
  save([...SEED]);
  resetMessages();
};

export const getPhone = () => {
  try {
    return localStorage.getItem(PHONE_KEY) ?? '';
  } catch {
    return '';
  }
};
export const setPhone = (v: string) => {
  try {
    localStorage.setItem(PHONE_KEY, v);
  } catch {
    /* ignore */
  }
  emit();
};
export const usePhone = () => useSyncExternalStore(subscribe, getPhone);

export const priceChange = (l: Listing) => {
  const prev = l.price_history.at(-1)?.price;
  return prev && prev > l.price_rsd ? prev : null;
};

export function changePrice(id: string, price: number) {
  const l = load().find((x) => x.id === id);
  if (!l || price === l.price_rsd) return;
  updateListing(id, { price_rsd: price, price_history: [...l.price_history, { price: l.price_rsd, at: new Date().toISOString() }] });
}

// ---- followed listings (the real version stores this on the server and sends push + e-mail)
const WATCH_KEY = 'kockolov.proto.watches.v1';
type Watches = Record<string, { price: number; at: string }>;
let watchRaw = '';
let watchVal: Watches = {};
function getWatches(): Watches {
  try {
    const raw = localStorage.getItem(WATCH_KEY) ?? '';
    if (raw !== watchRaw) {
      watchRaw = raw;
      watchVal = raw ? (JSON.parse(raw) as Watches) : {};
    }
  } catch {
    /* keep the last value */
  }
  return watchVal;
}
function saveWatches(w: Watches) {
  try {
    localStorage.setItem(WATCH_KEY, JSON.stringify(w));
  } catch {
    /* ignore */
  }
  emit();
}
export const useWatches = () => useSyncExternalStore(subscribe, getWatches);
export function toggleWatch(l: Listing) {
  const w = { ...getWatches() };
  if (w[l.id]) delete w[l.id];
  else w[l.id] = { price: l.price_rsd, at: new Date().toISOString() };
  saveWatches(w);
}
/** The price the follower was last told about; after "U redu" it moves to the current price */
export function ackWatch(l: Listing) {
  const w = getWatches();
  if (w[l.id]) saveWatches({ ...w, [l.id]: { price: l.price_rsd, at: new Date().toISOString() } });
}
export type WatchNotice = { listing: Listing; kind: 'drop' | 'sold' | 'rise'; from: number };
export function noticesFor(all: Listing[], w: Watches): WatchNotice[] {
  const out: WatchNotice[] = [];
  for (const l of all) {
    const f = w[l.id];
    if (!f) continue;
    if (l.status === 'sold') out.push({ listing: l, kind: 'sold', from: f.price });
    else if (l.price_rsd < f.price) out.push({ listing: l, kind: 'drop', from: f.price });
    else if (l.price_rsd > f.price) out.push({ listing: l, kind: 'rise', from: f.price });
  }
  return out;
}
export const useWatchCount = () => Object.keys(useWatches()).length;

// ---- catalog of every LEGO set ever made (optional file made by web/scripts/build-catalog.mjs from Rebrickable's free CSVs)
export type CatalogEntry = [name: string, year: number, pieces: number, theme: string, subtheme: string | null];
let catalogP: Promise<Record<string, CatalogEntry> | null> | null = null;
export function loadCatalog() {
  catalogP ??= fetch('/lego-catalog.json')
    .then((r) => (r.ok && (r.headers.get('content-type') ?? '').includes('json') ? (r.json() as Promise<Record<string, CatalogEntry>>) : null))
    .catch(() => null);
  return catalogP;
}

export const PHOTO_W = 1200;
export const PHOTO_H = 900;

/** Center-crops a photo to 4:3, scales it to 1200×900 and stamps the Kockolov mark in the bottom right corner */
export function processPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const c = document.createElement('canvas');
      c.width = PHOTO_W;
      c.height = PHOTO_H;
      const g = c.getContext('2d')!;
      // "cover" crop around the middle of the picture
      const k = Math.max(PHOTO_W / img.width, PHOTO_H / img.height);
      const w = img.width * k;
      const h = img.height * k;
      g.drawImage(img, (PHOTO_W - w) / 2, (PHOTO_H - h) / 2, w, h);
      stampMark(g);
      resolve(c.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => (URL.revokeObjectURL(url), reject(new Error('image')));
    img.src = url;
  });
}

function stampMark(g: CanvasRenderingContext2D) {
  const pad = 24;
  const hgt = 56;
  g.font = '800 28px "Plus Jakarta Sans Variable", system-ui, sans-serif';
  const text = 'Kockolov';
  const tw = g.measureText(text).width;
  const iw = 40;
  const w = pad * 0.8 + iw + 10 + tw + pad * 0.8;
  const x = PHOTO_W - w - pad;
  const y = PHOTO_H - hgt - pad;
  g.save();
  g.fillStyle = 'rgba(22,21,15,0.72)';
  g.beginPath();
  g.roundRect(x, y, w, hgt, hgt / 2);
  g.fill();
  // the logo brick with its lens, drawn from the same shapes as the site's logo (40×40 grid)
  const s = iw / 40;
  const ox = x + pad * 0.8;
  const oy = y + (hgt - iw) / 2;
  g.fillStyle = '#ffcf00';
  for (const [rx, ry, rw, rh, rr] of [[2, 11, 30, 23, 5], [7, 5, 8, 7, 2.2], [19, 5, 8, 7, 2.2]]) {
    g.beginPath();
    g.roundRect(ox + rx * s, oy + ry * s, rw * s, rh * s, rr * s);
    g.fill();
  }
  g.fillStyle = '#fff';
  g.strokeStyle = '#16150f';
  g.lineWidth = 3 * s;
  g.beginPath();
  g.arc(ox + 28 * s, oy + 27 * s, 7.2 * s, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.lineCap = 'round';
  g.lineWidth = 3.6 * s;
  g.beginPath();
  g.moveTo(ox + 33.2 * s, oy + 32.2 * s);
  g.lineTo(ox + 38 * s, oy + 37 * s);
  g.stroke();
  g.fillStyle = '#fff';
  g.textBaseline = 'middle';
  g.fillText(text, ox + iw + 10, y + hgt / 2 + 1);
  g.restore();
}

// PROTOTYPE (phase 0): classifieds data lives in this browser's localStorage only — no server, nothing is shared.
// The real version replaces this file with API calls (/api/oglasi/*); pages and components stay as they are.
import { useSyncExternalStore } from 'react';

export type Condition = 'new_sealed' | 'new_opened' | 'used_complete' | 'used_incomplete' | 'parts';
export const CONDITIONS: Condition[] = ['new_sealed', 'new_opened', 'used_complete', 'used_incomplete', 'parts'];

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
  negotiable: boolean;
  city: string;
  images: string[];
  seller: string;
  seller_since: string;
  seller_phone: string | null;
  mine: boolean;
  status: 'active' | 'paused' | 'sold';
  created_at: string;
  views: number;
}

const KEY = 'kockolov.proto.listings.v2';
const PHONE_KEY = 'kockolov.proto.phone';
const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

/** Colored brick placeholder photo, so seed listings have a picture without any file */
function brick(c1: string, c2: string, label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="400" height="400" fill="${c2}"/><g fill="${c1}"><rect x="70" y="170" width="260" height="130" rx="14"/><rect x="100" y="132" width="52" height="40" rx="10"/><rect x="174" y="132" width="52" height="40" rx="10"/><rect x="248" y="132" width="52" height="40" rx="10"/></g><rect x="70" y="262" width="260" height="38" rx="14" fill="rgba(0,0,0,.12)"/><text x="200" y="352" text-anchor="middle" font-family="sans-serif" font-weight="800" font-size="26" fill="rgba(0,0,0,.45)">${label}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const SEED: Listing[] = [
  { id: 'a1', title: 'Millennium Falcon UCS, kompletan sa kutijom', description: 'Sklopljen jednom, stajao u vitrini. Sve kesice su unutra, uputstvo i kutija u odličnom stanju. Lično preuzimanje u Beogradu, može provera pred kupovinu.', set_num: '75192', theme_slug: 'star-wars', theme_name: 'Star Wars', condition: 'used_complete', has_box: true, has_manual: true, price_rsd: 58000, negotiable: true, city: 'Beograd', images: [brick('#6b7280', '#e5e7eb', '75192')], seller: 'Nikola M.', seller_since: '2026-09-02', seller_phone: '+381 64 111 2233', mine: false, status: 'active', created_at: day(1), views: 142 },
  { id: 'a2', title: 'Buket ruža 10328, nov, neotvoren', description: 'Poklon koji mi ne treba. Folija na kutiji je netaknuta. Račun iz radnje postoji.', set_num: '10328', theme_slug: 'botanicals', theme_name: 'Botanicals', condition: 'new_sealed', has_box: true, has_manual: true, price_rsd: 4900, negotiable: false, city: 'Novi Sad', images: [brick('#e11d48', '#ffe4e6', '10328')], seller: 'Jelena P.', seller_since: '2026-10-11', seller_phone: '+381 63 222 3344', mine: false, status: 'active', created_at: day(0), views: 57 },
  { id: 'a3', title: 'Lot: 12 Technic setova, bez kutija', description: 'Prodaje se zajedno ili pojedinačno (pitajte). Sve proverene po delovima, nedostaje nekoliko stikera.', set_num: null, theme_slug: 'technic', theme_name: 'Technic', condition: 'used_incomplete', has_box: false, has_manual: false, price_rsd: 24000, negotiable: true, city: 'Niš', images: [brick('#cf1419', '#fee2e2', 'TECHNIC')], seller: 'Marko D.', seller_since: '2026-08-20', seller_phone: null, mine: false, status: 'active', created_at: day(3), views: 211 },
  { id: 'a4', title: 'Hogwarts dvorac 71043 – otvoren, nikad sklapan', description: 'Kutija otvorena zbog provere kesica, ništa nije sklapano. Kutija ima malo istrošenih ivica.', set_num: '71043', theme_slug: 'harry-potter', theme_name: 'Harry Potter', condition: 'new_opened', has_box: true, has_manual: true, price_rsd: 47000, negotiable: true, city: 'Beograd', images: [brick('#7c3aed', '#ede9fe', '71043')], seller: 'Ana S.', seller_since: '2026-07-14', seller_phone: '+381 65 333 4455', mine: false, status: 'active', created_at: day(5), views: 98 },
  { id: 'a5', title: 'Kesa figurica: 40 komada, Ninjago i City', description: 'Čiste, bez oštećenja štampe. Šaljem Postexpressom uz plaćanje pouzećem.', set_num: null, theme_slug: 'ninjago', theme_name: 'Ninjago', condition: 'parts', has_box: false, has_manual: false, price_rsd: 6500, negotiable: false, city: 'Kragujevac', images: [brick('#16a34a', '#dcfce7', 'FIGURICE')], seller: 'Stefan R.', seller_since: '2026-10-02', seller_phone: '+381 60 444 5566', mine: false, status: 'active', created_at: day(8), views: 33 },
  { id: 'a6', title: 'Monster Jam DIGatron 42199, sklopljen', description: 'Sve radi, povlačenje na nazad. Nedostaje kutija.', set_num: '42199', theme_slug: 'technic', theme_name: 'Technic', condition: 'used_complete', has_box: false, has_manual: true, price_rsd: 2700, negotiable: true, city: 'Subotica', images: [brick('#0ea5e9', '#e0f2fe', '42199')], seller: 'Dejan K.', seller_since: '2026-06-30', seller_phone: '+381 64 555 6677', mine: false, status: 'active', created_at: day(11), views: 120 },
];

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
export const resetPrototype = () => save([...SEED]);

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

/** Shrinks a chosen photo to max 900 px JPEG so a few of them fit in localStorage */
export function shrinkImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 900 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = () => (URL.revokeObjectURL(url), reject(new Error('image')));
    img.src = url;
  });
}

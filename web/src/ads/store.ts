import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

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
  /** ids of the pictures, same order as images (needed to edit the ad) */
  image_ids: number[];
  seller: string;
  seller_since: string;
  /** the number itself is only given on request (GET /api/oglasi/:id/telefon) */
  has_phone: boolean;
  mine: boolean;
  watched: boolean;
  status: 'active' | 'paused' | 'sold' | 'expired' | 'removed';
  created_at: string;
  views: number;
  /** only for the owner */
  expires_at?: string;
  removed_reason?: string | null;
}

/** An ad somebody follows, with what changed since they last looked */
export type WatchedListing = Listing & { seen_price: number; notice: 'drop' | 'rise' | 'sold' | null };

export interface AdsStatus {
  unread: number;
  notices: number;
  mine: number;
}

export interface Conversation {
  id: number;
  listing_id: number;
  listing_title: string;
  listing_price: number;
  listing_status: Listing['status'];
  listing_image: string | null;
  my_ad: boolean;
  other: string;
  last: { text: string; at: string; mine: boolean } | null;
  unread: number;
}
export interface Thread {
  id: number;
  listing_id: number;
  messages: { id: number; mine: boolean; text: string; at: string }[];
}

export const priceChange = (l: Listing) => {
  const prev = l.price_history.at(-1)?.price;
  return prev && prev > l.price_rsd ? prev : null;
};

const items = <T,>(r: { items: T[] }) => r.items;

/** All active ads (the page filters them itself; the server caps the list at 2000, newest first) */
export const useAds = () => useQuery({ queryKey: ['ads'], queryFn: () => api<{ items: Listing[] }>('/api/oglasi').then(items), staleTime: 30_000 });
export const useAd = (id: string | undefined) => useQuery({ queryKey: ['ad', id], queryFn: () => api<Listing>(`/api/oglasi/${id}`), enabled: !!id, staleTime: 15_000, retry: false });
export const useMyAds = () => useQuery({ queryKey: ['my-ads'], queryFn: () => api<{ items: Listing[] }>('/api/me/oglasi').then(items), staleTime: 15_000 });
export const useWatchedAds = () => useQuery({ queryKey: ['watched-ads'], queryFn: () => api<{ items: WatchedListing[] }>('/api/me/oglasi/pracenje').then(items), staleTime: 15_000 });
export const useConversations = () =>
  useQuery({ queryKey: ['conversations'], queryFn: () => api<{ items: Conversation[] }>('/api/poruke').then(items), staleTime: 5_000, refetchInterval: 20_000 });
export const useThread = (id: string | undefined) =>
  useQuery({ queryKey: ['thread', id], queryFn: () => api<Thread>(`/api/poruke/${id}`), enabled: !!id, staleTime: 0, refetchInterval: 8_000, retry: false });

/** Badges in the header: unread messages and followed ads with news. A light call every 45 s while the tab is open. */
export function useAdsStatus(): AdsStatus {
  const { user, listings } = useAuth();
  const q = useQuery({
    queryKey: ['ads-status'],
    queryFn: () => api<AdsStatus>('/api/oglasi/status'),
    enabled: !!user && listings,
    staleTime: 20_000,
    refetchInterval: 45_000,
  });
  return q.data ?? { unread: 0, notices: 0, mine: 0 };
}

export interface AdForm {
  title: string;
  description: string;
  set_num: string | null;
  theme_slug: string | null;
  theme_name: string | null;
  year: number | null;
  pieces: number | null;
  minifigs: number | null;
  condition: Condition;
  has_box: boolean;
  has_manual: boolean;
  price_rsd: number;
  negotiable: boolean;
  city: string;
  shipping: 'pickup' | 'ships';
  images: number[];
}

const DATA_KEYS = ['ads', 'ad', 'my-ads', 'watched-ads', 'ads-status', 'conversations', 'thread'];

/** Everything that changes data: each call refreshes the lists that may show it */
export function useAdActions() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ predicate: (q) => DATA_KEYS.includes(String(q.queryKey[0])) });
  const run = <T,>(p: Promise<T>) => p.finally(() => void refresh());
  const post = (path: string, json?: unknown) => run(api<{ ok: boolean }>(path, { method: 'POST', json: json ?? {} }));
  return {
    refresh,
    create: (f: AdForm) => run(api<{ id: string }>('/api/oglasi', { method: 'POST', json: f })),
    update: (id: string, f: AdForm) => run(api<{ id: string }>(`/api/oglasi/${id}`, { method: 'PUT', json: f })),
    setStatus: (id: string, status: 'active' | 'paused' | 'sold') => run(api(`/api/oglasi/${id}/status`, { method: 'PATCH', json: { status } })),
    setPrice: (id: string, price_rsd: number) => run(api(`/api/oglasi/${id}/cena`, { method: 'PATCH', json: { price_rsd } })),
    renew: (id: string) => post(`/api/oglasi/${id}/obnovi`),
    remove: (id: string) => run(api(`/api/oglasi/${id}`, { method: 'DELETE' })),
    watch: (id: string, on: boolean) => run(api(`/api/oglasi/${id}/prati`, { method: on ? 'PUT' : 'DELETE' })),
    seen: (id: string) => post(`/api/oglasi/${id}/prati/vidjeno`),
    phone: (id: string) => api<{ phone: string }>(`/api/oglasi/${id}/telefon`).then((r) => r.phone),
    report: (id: string, reason: string) => post(`/api/oglasi/${id}/prijava`, { reason }),
    /** First or further message about an ad; returns the conversation to open */
    message: (adId: string, text: string) => run(api<{ conversation_id: number }>(`/api/oglasi/${adId}/poruke`, { method: 'POST', json: { text } })).then((r) => r.conversation_id),
    reply: (convId: number | string, text: string) => run(api(`/api/poruke/${convId}`, { method: 'POST', json: { text } })),
    reportConversation: (convId: number | string) => post(`/api/poruke/${convId}/prijava`),
    uploadPhoto: async (file: File) => api<{ id: number; url: string }>('/api/oglasi/slike', { method: 'POST', body: await shrink(file), headers: { 'Content-Type': 'image/jpeg' } }),
  };
}

/** Saves phone and the e-mail switch on the account */
export function useProfileMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: { phone?: string; msgEmailEnabled?: boolean }) => api('/api/me', { method: 'PATCH', json: patch }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });
}

/** Phones take 8–12 MB photos: shrink to 2000 px on the long side before sending (the server makes the final 1200×900 frame) */
async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) throw new Error('image');
  const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('image'))), 'image/jpeg', 0.88));
}

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

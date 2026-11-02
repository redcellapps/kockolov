import { config } from '../config.js';
import { one, pool, query, tx, type Queryable } from '../db.js';
import { isImageName, removeImage } from './images.js';

export const MAX_IMAGES = 8;
export const AD_DAYS = 30;
export const MAX_ACTIVE_PER_USER = 50;

export type Condition = 'like_new' | 'used_complete' | 'used_incomplete' | 'parts';

/** Who may use Oglasi right now (LISTINGS_MODE: off, admins only, everybody signed in) */
export function listingsEnabledFor(user: { role: string } | null): boolean {
  if (config.LISTINGS_MODE === 'on') return true;
  return config.LISTINGS_MODE === 'admins' && user?.role === 'admin';
}

/** Digits, spaces and + - ( ) only, 8 to 18 digits ("+381 63 805 2042"); null when empty */
export function cleanPhone(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim();
  if (!v) return null;
  if (!/^[+0-9 ()\-/]+$/.test(v)) throw new PhoneError();
  const digits = v.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 18) throw new PhoneError();
  return v.replace(/\s+/g, ' ');
}
export class PhoneError extends Error {
  constructor() {
    super('Unesi ispravan broj telefona.');
  }
}

export interface ListingRow {
  id: number;
  user_id: number;
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
  status: 'active' | 'paused' | 'sold' | 'expired' | 'removed';
  removed_reason: string | null;
  views: number;
  created_at: string;
  updated_at: string;
  expires_at: string;
  seller_name: string;
  seller_since: string;
  has_phone: boolean;
  images: string[];
  price_history: { price: number; at: string }[];
  watched: boolean;
}

/** $1 is always the viewer's user id (or null), so `watched` and `mine` can be answered in one query */
export const LISTING_SELECT = `
  SELECT l.*, u.name AS seller_name, u.created_at AS seller_since, coalesce(u.phone <> '', false) AS has_phone,
         coalesce((SELECT json_agg('/media/oglasi/' || i.file ORDER BY i.position, i.id) FROM listing_images i WHERE i.listing_id = l.id), '[]'::json) AS images,
         coalesce((SELECT json_agg(json_build_object('price', p.price_rsd, 'at', p.changed_at) ORDER BY p.changed_at, p.id) FROM listing_prices p WHERE p.listing_id = l.id), '[]'::json) AS price_history,
         EXISTS (SELECT 1 FROM listing_watches w WHERE w.listing_id = l.id AND w.user_id = $1::bigint) AS watched
    FROM listings l JOIN users u ON u.id = l.user_id`;

/** What the web app gets: no user id of the seller, no e-mail, no phone */
export function present(l: ListingRow, viewerId: number | null) {
  const { user_id, removed_reason, expires_at, updated_at, seller_name, ...rest } = l;
  const mine = viewerId !== null && user_id === viewerId;
  return {
    ...rest,
    id: String(l.id),
    seller: seller_name?.trim() || 'Korisnik',
    mine,
    expires_at: mine ? expires_at : undefined,
    removed_reason: mine ? removed_reason : undefined,
  };
}

export async function loadListing(id: number, viewerId: number | null, db: Queryable = pool) {
  return one<ListingRow>(`${LISTING_SELECT} WHERE l.id = $2`, [viewerId, id], db);
}

/** Active ads for the public list (newest first). The web app filters them itself, which is fine up to a few thousand ads. */
export const LIST_LIMIT = 2000;
export async function activeListings(viewerId: number | null) {
  return query<ListingRow>(`${LISTING_SELECT} WHERE l.status = 'active' AND l.expires_at > now() ORDER BY l.created_at DESC LIMIT ${LIST_LIMIT}`, [viewerId]);
}

/** Deletes the ad's picture files (rows go with the ad) */
export async function dropFiles(files: string[]) {
  await Promise.all(files.filter(isImageName).map(removeImage));
}

export async function filesOfUser(userId: number): Promise<string[]> {
  return (await query<{ file: string }>('SELECT file FROM listing_images WHERE user_id = $1', [userId])).map((r) => r.file);
}

/** Moves ads to "expired" once their 30 days are over; returns how many */
export async function expireListings(): Promise<number> {
  const r = await query<{ id: number }>("UPDATE listings SET status = 'expired', updated_at = now() WHERE status = 'active' AND expires_at < now() RETURNING id");
  return r.length;
}

/** Pictures uploaded but never attached to an ad (older than a day): rows and files */
export async function sweepOrphanImages(): Promise<number> {
  const rows = await query<{ file: string }>("DELETE FROM listing_images WHERE listing_id IS NULL AND created_at < now() - interval '1 day' RETURNING file");
  await dropFiles(rows.map((r) => r.file));
  return rows.length;
}
export { tx };

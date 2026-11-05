import { config } from '../config.js';
import { one, pool, query, tx, type Queryable } from '../db.js';
import { renderListingMail } from '../mail/listing.js';
import { isImageName, removeImage } from './images.js';
import { notifyOwner } from '../push/notify.js';

export const MAX_IMAGES = 8;
export const AD_DAYS = 30;
export const MAX_ACTIVE_PER_USER = 50;
/** An expired ad is kept (the owner can renew it) this long, then it is deleted */
export const EXPIRED_KEEP_DAYS = 30;
/** Reminder e-mails: days before the end for stages 1, 2 and 3 */
export const REMINDER_DAYS = [7, 3, 1] as const;

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
  expired_at: string | null;
  notified_stage: number;
  seller_name: string;
  seller_since: string;
  has_phone: boolean;
  images: string[];
  image_ids: number[];
  price_history: { price: number; at: string }[];
  watched: boolean;
  /** the viewer blocked this seller */
  blocked: boolean;
}

/** $1 is always the viewer's user id (or null), so `watched` and `mine` can be answered in one query */
export const LISTING_SELECT = `
  SELECT l.*, u.name AS seller_name, u.created_at AS seller_since, coalesce(u.phone <> '', false) AS has_phone,
         coalesce((SELECT json_agg('/media/oglasi/' || i.file ORDER BY i.position, i.id) FROM listing_images i WHERE i.listing_id = l.id), '[]'::json) AS images,
         coalesce((SELECT json_agg(i.id ORDER BY i.position, i.id) FROM listing_images i WHERE i.listing_id = l.id), '[]'::json) AS image_ids,
         coalesce((SELECT json_agg(json_build_object('price', p.price_rsd, 'at', p.changed_at) ORDER BY p.changed_at, p.id) FROM listing_prices p WHERE p.listing_id = l.id), '[]'::json) AS price_history,
         EXISTS (SELECT 1 FROM listing_watches w WHERE w.listing_id = l.id AND w.user_id = $1::bigint) AS watched,
         EXISTS (SELECT 1 FROM user_blocks b WHERE b.blocker_id = $1::bigint AND b.blocked_id = l.user_id) AS blocked
    FROM listings l JOIN users u ON u.id = l.user_id`;

/** What the web app gets: no user id of the seller, no e-mail, no phone */
export function present(l: ListingRow, viewerId: number | null) {
  const { user_id, removed_reason, expires_at, expired_at, notified_stage, updated_at, seller_name, set_alerted: _a, ...rest } = l as ListingRow & { set_alerted?: boolean };
  const mine = viewerId !== null && user_id === viewerId;
  return {
    ...rest,
    id: String(l.id),
    seller: seller_name?.trim() || 'Korisnik',
    mine,
    expires_at: mine ? expires_at : undefined,
    /** when an expired ad will be deleted unless it is renewed (owner only) */
    delete_at: mine && expired_at ? new Date(+new Date(expired_at) + EXPIRED_KEEP_DAYS * 86_400_000).toISOString() : undefined,
    removed_reason: mine ? removed_reason : undefined,
  };
}

export async function loadListing(id: number, viewerId: number | null, db: Queryable = pool) {
  return one<ListingRow>(`${LISTING_SELECT} WHERE l.id = $2`, [viewerId, id], db);
}

/** Active ads for the public list (newest first). The web app filters them itself, which is fine up to a few thousand ads. */
export const LIST_LIMIT = 2000;
export async function activeListings(viewerId: number | null) {
  // ads of sellers the viewer blocked are left out
  return query<ListingRow>(
    `${LISTING_SELECT} WHERE l.status = 'active' AND l.expires_at > now()
        AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE b.blocker_id = $1::bigint AND b.blocked_id = l.user_id)
      ORDER BY l.created_at DESC LIMIT ${LIST_LIMIT}`,
    [viewerId],
  );
}

/** Deletes the ad's picture files (rows go with the ad) */
export async function dropFiles(files: string[]) {
  await Promise.all(files.filter(isImageName).map(removeImage));
}

export async function filesOfUser(userId: number): Promise<string[]> {
  return (await query<{ file: string }>('SELECT file FROM listing_images WHERE user_id = $1', [userId])).map((r) => r.file);
}

/** Moves ads to "expired" once their 30 days are over (active and paused ones); returns how many */
export async function expireListings(): Promise<number> {
  const r = await query<{ id: number }>(
    "UPDATE listings SET status = 'expired', expired_at = now(), updated_at = now() WHERE status IN ('active', 'paused') AND expires_at < now() RETURNING id",
  );
  // the owners hear about it on the phone (the e-mails warned them 7, 3 and 1 day before)
  for (const { id } of r) await notifyOwner(id, { kind: 'expired' }).catch((e: unknown) => console.warn(`obaveštenja: ${(e as Error).message}`));
  return r.length;
}

/** Reminder stage for an ad with this much time left (0 = none yet) */
export const reminderStage = (msLeft: number) => (msLeft <= 1 * 86_400_000 ? 3 : msLeft <= 3 * 86_400_000 ? 2 : msLeft <= 7 * 86_400_000 ? 1 : 0);

type Mailer = (m: { to: string; subject: string; html: string; text: string }) => Promise<void>;

/**
 * E-mails the owner 7, 3 and 1 day before an ad runs out (one e-mail per stage, even if the job was late).
 * Renewing the ad starts over (notified_stage goes back to 0). Returns how many e-mails went out.
 */
export async function sendExpiryReminders(send: Mailer, log: (m: string) => void = () => {}): Promise<number> {
  const rows = await query<{ id: number; title: string; expires_at: string; notified_stage: number; email: string; name: string }>(
    `SELECT l.id, l.title, l.expires_at, l.notified_stage, u.email, u.name
       FROM listings l JOIN users u ON u.id = l.user_id
      WHERE l.status IN ('active', 'paused') AND l.expires_at > now() AND l.expires_at <= now() + interval '7 days'`,
  );
  let sent = 0;
  for (const r of rows) {
    const stage = reminderStage(+new Date(r.expires_at) - Date.now());
    if (stage <= r.notified_stage) continue;
    // claim the stage first, so two overlapping runs never send the same e-mail twice
    const claimed = await one('UPDATE listings SET notified_stage = $2 WHERE id = $1 AND notified_stage < $2 RETURNING id', [r.id, stage]);
    if (!claimed) continue;
    try {
      const m = renderListingMail({ kind: 'expiring', name: r.name, title: r.title, daysLeft: REMINDER_DAYS[stage - 1], expiresAt: r.expires_at });
      await send({ to: r.email, subject: m.subject, html: m.html, text: m.text });
      sent++;
      // and on the phone (a failed notification must not undo the reminder)
      await notifyOwner(r.id, { kind: 'expiring', daysLeft: REMINDER_DAYS[stage - 1] }).catch((e: unknown) => log(`oglasi: obaveštenje za oglas ${r.id}: ${(e as Error).message}`));
    } catch (err) {
      log(`oglasi: podsetnik za oglas ${r.id} nije poslat: ${(err as Error).message}`);
      await query('UPDATE listings SET notified_stage = $2 WHERE id = $1 AND notified_stage = $3', [r.id, r.notified_stage, stage]);
    }
  }
  return sent;
}

/** Deletes ads that stayed expired for 30 days (pictures too) and tells their owners. Conversations stay. */
export async function purgeExpiredListings(send: Mailer, log: (m: string) => void = () => {}): Promise<number> {
  const rows = await query<{ id: number; title: string; email: string; name: string; files: string[] }>(
    `SELECT l.id, l.title, u.email, u.name,
            coalesce((SELECT array_agg(i.file) FROM listing_images i WHERE i.listing_id = l.id), '{}') AS files
       FROM listings l JOIN users u ON u.id = l.user_id
      WHERE l.status = 'expired' AND l.expired_at < now() - make_interval(days => $1)`,
    [EXPIRED_KEEP_DAYS],
  );
  for (const r of rows) {
    await query("DELETE FROM listings WHERE id = $1 AND status = 'expired'", [r.id]);
    await dropFiles(r.files);
    try {
      const m = renderListingMail({ kind: 'deleted', name: r.name, title: r.title });
      await send({ to: r.email, subject: m.subject, html: m.html, text: m.text });
    } catch (err) {
      log(`oglasi: mejl o brisanju oglasa ${r.id} nije poslat: ${(err as Error).message}`);
    }
  }
  return rows.length;
}

/** Resolved reports are not kept longer than a year */
export async function purgeOldReports(): Promise<number> {
  const r = await query("DELETE FROM listing_reports WHERE resolved_at < now() - interval '365 days' RETURNING id");
  return r.length;
}

/** Pictures uploaded but never attached to an ad (older than a day): rows and files */
export async function sweepOrphanImages(): Promise<number> {
  const rows = await query<{ file: string }>("DELETE FROM listing_images WHERE listing_id IS NULL AND created_at < now() - interval '1 day' RETURNING file");
  await dropFiles(rows.map((r) => r.file));
  return rows.length;
}
export { tx };

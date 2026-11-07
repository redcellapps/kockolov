import { createHash } from 'node:crypto';
import { one, query } from '../../db.js';
import { fold, type PromoCandidate } from './extract.js';

export interface UpsertResult {
  action: 'new' | 'seen' | 'changed';
}

/**
 * Saves what the crawler read. A new promotion starts as 'pending'. One seen again only has its last-seen time
 * refreshed. An approved one whose text changed goes back to 'pending' (flagged), so no outdated terms stay public.
 * Rejected ones stay rejected, and manual entries are never touched.
 */
export async function upsertCandidate(shopId: string, c: PromoCandidate): Promise<UpsertResult> {
  const fingerprint = createHash('sha1').update(fold(c.details)).digest('hex');
  const existing = await one<{ id: number; source: string; status: string; fingerprint: string | null }>(
    'SELECT id, source, status, fingerprint FROM promos WHERE shop_id = $1 AND source_url = $2 AND kind = $3 AND lower(title) = lower($4)',
    [shopId, c.sourceUrl, c.kind, c.title],
  );
  if (!existing) {
    await query(
      `INSERT INTO promos (shop_id, kind, title, details, min_basket_rsd, discount_pct, themes, valid_from, valid_until, source_url, fingerprint)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [shopId, c.kind, c.title, c.details, c.minBasketRsd, c.discountPct, c.themes, c.validFrom, c.validUntil, c.sourceUrl, fingerprint],
    );
    return { action: 'new' };
  }
  if (existing.source === 'manual' || existing.status === 'rejected') {
    await query('UPDATE promos SET last_seen_at = now() WHERE id = $1', [existing.id]);
    return { action: 'seen' };
  }
  if (existing.fingerprint === fingerprint) {
    await query('UPDATE promos SET last_seen_at = now() WHERE id = $1', [existing.id]);
    return { action: 'seen' };
  }
  const wasApproved = existing.status === 'approved';
  await query(
    `UPDATE promos SET details = $2, min_basket_rsd = $3, discount_pct = $4, themes = $5, valid_from = $6, valid_until = $7,
            fingerprint = $8, last_seen_at = now(),
            status = CASE WHEN $9 THEN 'pending' ELSE status END, changed = changed OR $9
      WHERE id = $1`,
    [existing.id, c.details, c.minBasketRsd, c.discountPct, c.themes, c.validFrom, c.validUntil, fingerprint, wasApproved],
  );
  return { action: 'changed' };
}

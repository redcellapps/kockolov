import { query } from '../../db.js';
import { fold } from './extract.js';

function words(text: string): Set<string> {
  return new Set(fold(text).split(/[^a-z0-9]+/).filter((w) => w.length > 2));
}

/** Share of the smaller text's words found in the other: the same promotion worded a little differently, or one passage
 *  nested in another, scores high. */
export function similarity(a: string, b: string): number {
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return 0;
  let both = 0;
  for (const w of A) if (B.has(w)) both++;
  return both / Math.min(A.size, B.size);
}

export const SAME_PROMO = 0.75;
export const isSamePromo = (a: string, b: string) => similarity(a, b) >= SAME_PROMO;

interface Row {
  id: number;
  shop_id: string;
  title: string;
  details: string;
  status: string;
  source: string;
  first_seen_at: Date;
  facts: number;
}

/**
 * Merges look-alikes per shop. A proposal that matches something already decided (approved, rejected or entered by hand)
 * is dropped, and of several waiting proposals only the most complete one stays. Decided promotions are never touched.
 */
export async function dedupePromos(): Promise<number> {
  const rows = await query<Row>(
    `SELECT id, shop_id, title, details, status, source, first_seen_at,
            (min_basket_rsd IS NOT NULL)::int + (discount_pct IS NOT NULL)::int + (valid_until IS NOT NULL)::int + (valid_from IS NOT NULL)::int AS facts
       FROM promos`,
  );
  const drop: number[] = [];
  const byShop = new Map<string, Row[]>();
  for (const r of rows) byShop.set(r.shop_id, [...(byShop.get(r.shop_id) ?? []), r]);
  for (const list of byShop.values()) {
    const decided = list.filter((r) => r.source === 'manual' || r.status !== 'pending');
    // most complete first, then the longer text, then the older one
    const pending = list
      .filter((r) => r.source !== 'manual' && r.status === 'pending')
      .sort((a, b) => b.facts - a.facts || b.details.length - a.details.length || +a.first_seen_at - +b.first_seen_at);
    const kept: Row[] = [];
    for (const p of pending) {
      const text = `${p.title} ${p.details}`;
      if (decided.some((d) => isSamePromo(text, `${d.title} ${d.details}`)) || kept.some((k) => isSamePromo(text, `${k.title} ${k.details}`))) drop.push(p.id);
      else kept.push(p);
    }
  }
  if (drop.length) await query('DELETE FROM promos WHERE id = ANY($1)', [drop]);
  return drop.length;
}

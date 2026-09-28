import { query, tx } from '../db.js';
import { todayLocal } from '../lib/time.js';

export type DealReason =
  | { type: 'vs_rrp'; pct: number; amount: number }
  | { type: 'vs_next'; pct: number; amount: number; shop: string; seller: string }
  | { type: 'shop_sale'; pct: number }
  | { type: 'new_low'; days: number }
  | { type: 'only_offer' };

export interface DealCandidate {
  setNum: string;
  score: number;
  bestOfferId: number;
  bestPrice: number;
  referencePrice: number | null;
  reasons: DealReason[];
}

interface OfferRow {
  id: number;
  set_num: string;
  shop_id: string;
  seller: string;
  price_rsd: number;
  regular_price_rsd: number | null;
}

interface SetInfo {
  set_num: string;
  rrp_rsd: number | null;
  low90: number | null;
  history_days: number | null;
}

const MIN_PRICE = 700; // ignore tiny polybags
const SUSPICIOUS_RATIO = 0.35; // cheaper than 35% of reference -> probably a mismatch, skip

export function scoreSet(set: SetInfo, offers: OfferRow[]): DealCandidate | null {
  if (!offers.length) return null;
  const sorted = [...offers].sort((a, b) => a.price_rsd - b.price_rsd);
  const best = sorted[0];
  if (best.price_rsd < MIN_PRICE) return null;
  const second = sorted.find((o) => !(o.shop_id === best.shop_id && o.seller === best.seller) && o.price_rsd >= best.price_rsd);

  const rrp = set.rrp_rsd && set.rrp_rsd > 0 ? set.rrp_rsd : null;
  const reference = rrp ?? best.regular_price_rsd ?? second?.price_rsd ?? null;
  if (reference && best.price_rsd < reference * SUSPICIOUS_RATIO) return null;
  if (second && best.price_rsd < second.price_rsd * SUSPICIOUS_RATIO) return null;

  const reasons: DealReason[] = [];
  let score = 0;

  if (rrp && best.price_rsd < rrp) {
    const pct = (rrp - best.price_rsd) / rrp;
    reasons.push({ type: 'vs_rrp', pct: Math.round(pct * 100), amount: rrp - best.price_rsd });
    score += Math.min(pct, 0.6) * 100;
  } else if (!rrp && best.regular_price_rsd && best.regular_price_rsd > best.price_rsd) {
    const pct = (best.regular_price_rsd - best.price_rsd) / best.regular_price_rsd;
    reasons.push({ type: 'shop_sale', pct: Math.round(pct * 100) });
    score += Math.min(pct, 0.5) * 60; // shop's own "old price" is trusted less
  }

  if (second && second.price_rsd > best.price_rsd) {
    const pct = (second.price_rsd - best.price_rsd) / second.price_rsd;
    reasons.push({
      type: 'vs_next',
      pct: Math.round(pct * 100),
      amount: second.price_rsd - best.price_rsd,
      shop: second.shop_id,
      seller: second.seller,
    });
    score += Math.min(pct, 0.4) * 60;
  }

  if (set.low90 !== null && (set.history_days ?? 0) >= 14 && best.price_rsd < set.low90) {
    reasons.push({ type: 'new_low', days: Math.min(set.history_days ?? 0, 90) });
    score += 12;
  }

  // absolute savings matter: 20% off a 40.000 RSD set beats 20% off a 1.000 RSD set
  const savings = reference ? Math.max(0, reference - best.price_rsd) : 0;
  score += Math.min(savings / 1000, 15);

  const worthIt = reasons.some(
    (r) => (r.type === 'vs_rrp' && r.pct >= 10) || (r.type === 'vs_next' && r.pct >= 8) || r.type === 'new_low' || (r.type === 'shop_sale' && r.pct >= 15),
  );
  if (!worthIt) return null;

  return {
    setNum: set.set_num,
    score: Math.round(score * 100) / 100,
    bestOfferId: best.id,
    bestPrice: best.price_rsd,
    referencePrice: reference,
    reasons,
  };
}

/** Build today's "best buy" list from current prices and history. */
export async function computeDeals(opts: { day?: string; limit?: number; log?: (m: string) => void } = {}) {
  const day = opts.day ?? todayLocal();
  const limit = opts.limit ?? 40;
  const log = opts.log ?? console.log;

  const offers = await query<OfferRow>(
    `SELECT id, set_num, shop_id, seller, price_rsd, regular_price_rsd
       FROM offers WHERE active AND in_stock AND set_num IS NOT NULL`,
  );
  const sets = await query<SetInfo>(
    `SELECT s.set_num, s.rrp_rsd, h.low90, h.history_days
       FROM sets s
       LEFT JOIN LATERAL (
         SELECT min(ph.price_rsd) FILTER (WHERE ph.in_stock AND ph.recorded_at >= now() - interval '90 days'
                                            AND ph.recorded_at < date_trunc('day', now())) AS low90,
                extract(day FROM now() - min(ph.recorded_at))::int AS history_days
           FROM price_history ph JOIN offers o ON o.id = ph.offer_id
          WHERE o.set_num = s.set_num
       ) h ON true
      WHERE EXISTS (SELECT 1 FROM offers o WHERE o.set_num = s.set_num AND o.active AND o.in_stock)`,
  );
  const bySet = new Map<string, OfferRow[]>();
  for (const o of offers) {
    if (!bySet.has(o.set_num)) bySet.set(o.set_num, []);
    bySet.get(o.set_num)!.push(o);
  }
  const candidates = sets
    .map((s) => scoreSet(s, bySet.get(s.set_num) ?? []))
    .filter((c): c is DealCandidate => !!c)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  await tx(async (db) => {
    await db.query('DELETE FROM deals WHERE day = $1', [day]);
    let rank = 1;
    for (const c of candidates) {
      await db.query(
        `INSERT INTO deals (day, set_num, rank, score, best_offer_id, best_price_rsd, reference_price_rsd, reasons)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [day, c.setNum, rank++, c.score, c.bestOfferId, c.bestPrice, c.referencePrice, JSON.stringify(c.reasons)],
      );
    }
  });
  log(`deals: ${candidates.length} ponuda za ${day}`);
  return candidates;
}

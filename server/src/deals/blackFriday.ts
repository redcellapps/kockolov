import { config } from '../config.js';
import { query } from '../db.js';

/*
 * Crni petak (Black Friday): every set at least 10% below its regular LEGO Store price today, with a
 * check whether that price is really the lowest of the last 30 days. The struck-through price a shop
 * shows is its own claim; the 30-day low is what the set actually cost (in any public shop, in stock),
 * the same rule the EU uses for "price before the discount".
 */

/** Black Friday 2026: the day after the fourth Thursday of November */
export const BLACK_FRIDAY = '2026-11-27';
/** Smallest discount that makes the list, against the LEGO Store regular price */
export const MIN_PCT = 10;

export interface BlackFridayItem {
  set_num: string;
  name: string;
  theme_slug: string | null;
  theme_name: string | null;
  image_url: string | null;
  best_price: number;
  best_shop: string;
  best_seller: string | null;
  /** regular price in the LEGO Store, the reference for the discount */
  rrp: number;
  pct: number;
  offers: number;
  /** lowest in-stock price in any public shop in the 30 days before today, and the day it was seen */
  min30: number | null;
  min30_at: string | null;
  /** today's price is the lowest of the last 30 days; null when there is no history yet */
  real: boolean | null;
}

export interface BlackFriday {
  date: string;
  /** today in Belgrade (YYYY-MM-DD), so the page can say "još N dana" the same on server and browser */
  today: string;
  total: number;
  real: number;
  max_pct: number | null;
  items: BlackFridayItem[];
}

let memo: { at: number; value: BlackFriday } | null = null;

/** The list, worked out at most every 5 minutes (prices change once a day, after the morning crawl). */
export async function blackFriday(opts: { fresh?: boolean } = {}): Promise<BlackFriday> {
  if (!opts.fresh && memo && Date.now() - memo.at < 5 * 60_000) return memo.value;
  const rows = await query<BlackFridayItem & { today: string }>(
    `WITH bounds AS (
       SELECT date_trunc('day', now() AT TIME ZONE $1) AT TIME ZONE $1 AS today_start,
              to_char(now() AT TIME ZONE $1, 'YYYY-MM-DD') AS today
     ),
     best AS (
       SELECT DISTINCT ON (o.set_num) o.set_num, o.price_rsd AS best_price, o.shop_id AS best_shop, nullif(o.seller, '') AS best_seller
         FROM public_offers o
        WHERE o.active AND o.in_stock AND o.set_num IS NOT NULL
        ORDER BY o.set_num, o.price_rsd, o.shop_id
     ),
     cand AS (
       SELECT b.*, s.name, s.theme_slug, t.name AS theme_name, s.image_url, s.rrp_rsd AS rrp,
              round(100.0 * (s.rrp_rsd - b.best_price) / s.rrp_rsd)::int AS pct
         FROM best b JOIN sets s ON s.set_num = b.set_num LEFT JOIN themes t ON t.slug = s.theme_slug
        WHERE s.rrp_rsd > 0 AND b.best_price * 100 <= s.rrp_rsd * (100 - $2)
     )
     SELECT c.*, bounds.today,
            (SELECT count(*)::int FROM public_offers x WHERE x.set_num = c.set_num AND x.active AND x.in_stock) AS offers,
            h.price AS min30,
            to_char(h.at AT TIME ZONE $1, 'YYYY-MM-DD') AS min30_at
       FROM cand c CROSS JOIN bounds
       LEFT JOIN LATERAL (
         SELECT x.price, x.at FROM (
           -- prices recorded during the 30 days before today
           SELECT ph.price_rsd AS price, ph.recorded_at AS at
             FROM price_history ph JOIN public_offers o ON o.id = ph.offer_id
            WHERE o.set_num = c.set_num AND ph.in_stock
              AND ph.recorded_at >= bounds.today_start - interval '30 days' AND ph.recorded_at < bounds.today_start
           UNION ALL
           -- and the price each offer already had when those 30 days began
           SELECT prev.price_rsd, bounds.today_start - interval '30 days'
             FROM public_offers o
             CROSS JOIN LATERAL (
               SELECT ph.price_rsd, ph.in_stock FROM price_history ph
                WHERE ph.offer_id = o.id AND ph.recorded_at < bounds.today_start - interval '30 days'
                ORDER BY ph.recorded_at DESC LIMIT 1
             ) prev
            WHERE o.set_num = c.set_num AND prev.in_stock
         ) x
         ORDER BY x.price, x.at DESC
         LIMIT 1
       ) h ON true
      ORDER BY c.pct DESC, c.best_price DESC, c.set_num`,
    [config.TZ_NAME, MIN_PCT],
  );
  const items = rows.map(({ today: _today, ...r }) => ({ ...r, real: r.min30 == null ? null : r.best_price <= r.min30 }));
  const today =
    rows[0]?.today ?? new Intl.DateTimeFormat('en-CA', { timeZone: config.TZ_NAME, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const value: BlackFriday = {
    date: BLACK_FRIDAY,
    today,
    total: items.length,
    real: items.filter((i) => i.real).length,
    max_pct: items[0]?.pct ?? null,
    items,
  };
  memo = { at: Date.now(), value };
  return value;
}

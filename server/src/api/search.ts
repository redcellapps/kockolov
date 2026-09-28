import { normalizeText } from '../lib/normalize.js';

export interface SearchFilters {
  q?: string;
  setNums?: string[];
  themes?: string[];
  shops?: string[];
  min?: number;
  max?: number;
  sale?: boolean;
  stock?: boolean;
  ages?: string[];
  sort?: string;
  page?: number;
  size?: number;
}

export const AGE_BUCKETS: Record<string, [number, number]> = {
  '1-3': [0, 4],
  '4-6': [4, 7],
  '7-9': [7, 10],
  '10-13': [10, 14],
  '14-17': [14, 18],
  '18': [18, 99],
};

export const SORTS = ['relevance', 'deal', 'price_asc', 'price_desc', 'discount', 'newest', 'name'] as const;

class Params {
  values: unknown[] = [];
  add(v: unknown): string {
    this.values.push(v);
    return `$${this.values.length}`;
  }
}

/** CTEs computing, per set, the best current offer (optionally limited to some shops). */
function ctes(p: Params, shops?: string[]): string {
  const shopCond = shops?.length ? `AND shop_id = ANY(${p.add(shops)}::text[])` : '';
  return `
  WITH o AS (
    SELECT id, set_num, shop_id, seller, price_rsd, regular_price_rsd, in_stock
      FROM offers WHERE active AND set_num IS NOT NULL ${shopCond}
  ),
  agg AS (
    SELECT set_num,
           min(price_rsd) FILTER (WHERE in_stock) AS best_price,
           min(price_rsd) AS any_price,
           count(*) FILTER (WHERE in_stock)::int AS offers_in_stock,
           count(DISTINCT shop_id) FILTER (WHERE in_stock)::int AS shops_in_stock,
           coalesce(array_agg(DISTINCT shop_id) FILTER (WHERE in_stock), '{}') AS shops,
           coalesce(bool_or(in_stock AND regular_price_rsd > price_rsd), false) AS shop_sale
      FROM o GROUP BY set_num
  ),
  best AS (
    SELECT DISTINCT ON (set_num) set_num, shop_id AS best_shop, seller AS best_seller, id AS best_offer_id
      FROM o WHERE in_stock ORDER BY set_num, price_rsd, shop_id
  ),
  latest_deals AS (
    SELECT set_num, score, rank FROM deals WHERE day = (SELECT max(day) FROM deals)
  ),
  base AS (
    SELECT s.set_num, s.name, s.theme_slug, s.image_url, s.rrp_rsd, s.age_min, s.created_at, s.search_text,
           a.best_price, a.any_price, a.offers_in_stock, a.shops_in_stock, a.shops, a.shop_sale,
           b.best_shop, b.best_seller, b.best_offer_id,
           CASE WHEN s.rrp_rsd > 0 AND a.best_price < s.rrp_rsd
                THEN round(100.0 * (s.rrp_rsd - a.best_price) / s.rrp_rsd)::int ELSE 0 END AS discount_pct,
           d.score AS deal_score, d.rank AS deal_rank
      FROM sets s
      JOIN agg a ON a.set_num = s.set_num
      LEFT JOIN best b ON b.set_num = s.set_num
      LEFT JOIN latest_deals d ON d.set_num = s.set_num
  )`;
}

function where(p: Params, f: SearchFilters, skip: 'theme' | null): { sql: string; qNorm: string } {
  const conds: string[] = [];
  const qNorm = normalizeText(f.q);
  if (f.stock !== false) conds.push('best_price IS NOT NULL');
  if (f.setNums) conds.push(`set_num = ANY(${p.add(f.setNums)}::text[])`);
  for (const tok of qNorm.split(' ').filter(Boolean).slice(0, 8)) {
    conds.push(`search_text LIKE ${p.add(`%${tok}%`)}`);
  }
  if (skip !== 'theme' && f.themes?.length) conds.push(`theme_slug = ANY(${p.add(f.themes)}::text[])`);
  if (f.min !== undefined) conds.push(`coalesce(best_price, any_price) >= ${p.add(f.min)}`);
  if (f.max !== undefined) conds.push(`coalesce(best_price, any_price) <= ${p.add(f.max)}`);
  if (f.sale) conds.push('(discount_pct >= 5 OR shop_sale)');
  const ageConds = (f.ages ?? [])
    .filter((a) => AGE_BUCKETS[a])
    .map((a) => `(age_min >= ${AGE_BUCKETS[a][0]} AND age_min < ${AGE_BUCKETS[a][1]})`);
  if (ageConds.length) conds.push(`(${ageConds.join(' OR ')})`);
  return { sql: conds.length ? `WHERE ${conds.join(' AND ')}` : '', qNorm };
}

function orderBy(p: Params, sort: string, qNorm: string): string {
  const price = 'coalesce(best_price, any_price)';
  switch (sort) {
    case 'price_asc':
      return `${price} ASC, set_num`;
    case 'price_desc':
      return `${price} DESC, set_num`;
    case 'discount':
      return 'discount_pct DESC, shop_sale DESC, deal_score DESC NULLS LAST, set_num';
    case 'newest':
      return 'created_at DESC, set_num DESC';
    case 'name':
      return 'name ASC';
    case 'relevance':
      if (qNorm) {
        const q = p.add(qNorm);
        return `(set_num = ${q}) DESC, similarity(search_text, ${q}) DESC, deal_score DESC NULLS LAST, discount_pct DESC, set_num`;
      }
    // falls through
    case 'deal':
    default:
      return 'deal_score DESC NULLS LAST, discount_pct DESC, shops_in_stock DESC, set_num DESC';
  }
}

export function buildSearch(f: SearchFilters) {
  const p = new Params();
  const head = ctes(p, f.shops);
  const w = where(p, f, null);
  const sort = f.sort && (SORTS as readonly string[]).includes(f.sort) ? f.sort : w.qNorm ? 'relevance' : 'deal';
  const order = orderBy(p, sort, w.qNorm);
  const size = Math.min(Math.max(f.size ?? 24, 1), 96);
  const page = Math.max(f.page ?? 1, 1);
  const sql = `${head}
    SELECT base.*, t.name AS theme_name, count(*) OVER()::int AS total
      FROM base LEFT JOIN themes t ON t.slug = base.theme_slug
      ${w.sql}
     ORDER BY ${order}
     LIMIT ${p.add(size)} OFFSET ${p.add((page - 1) * size)}`;
  return { sql, params: p.values, page, size, sort };
}

/** Theme counts for the current filters (ignoring the theme filter itself). */
export function buildThemeFacet(f: SearchFilters) {
  const p = new Params();
  const head = ctes(p, f.shops);
  const w = where(p, f, 'theme');
  return {
    sql: `${head} SELECT theme_slug AS slug, count(*)::int AS count FROM base ${w.sql} GROUP BY theme_slug`,
    params: p.values,
  };
}

/** How many matching sets each shop has in stock (ignoring the shop filter). */
export function buildShopFacet(f: SearchFilters) {
  const p = new Params();
  const head = ctes(p, undefined);
  const w = where(p, f, null);
  return {
    sql: `${head} SELECT sh AS id, count(*)::int AS count FROM base CROSS JOIN LATERAL unnest(base.shops) sh ${w.sql} GROUP BY sh`,
    params: p.values,
  };
}

// In-browser port of server/src/api/search.ts for the preview build: the same filters, facets
// and sort orders, computed over the exported snapshot instead of Postgres.
import { normalizeText } from '../../../server/src/lib/normalize';
import type { SetSummary } from '../lib/api';

export interface DemoSet {
  set_num: string;
  name: string;
  theme_slug: string | null;
  theme_name: string | null;
  image_url: string | null;
  rrp_rsd: number | null;
  age_min: number | null;
  created_at: string;
  search_text: string;
}
export interface DemoOffer {
  id: number;
  set_num: string;
  shop_id: string;
  seller: string;
  price_rsd: number;
  regular_price_rsd: number | null;
  in_stock: boolean;
}
export interface DemoDeal {
  set_num: string;
  score: number;
  rank: number;
}

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

const AGE_BUCKETS: Record<string, [number, number]> = {
  '1-3': [0, 4],
  '4-6': [4, 7],
  '7-9': [7, 10],
  '10-13': [10, 14],
  '14-17': [14, 18],
  '18': [18, 99],
};
const SORTS = ['relevance', 'deal', 'price_asc', 'price_desc', 'discount', 'newest', 'name'];

type Row = SetSummary & { created_at: string; search_text: string };

/** pg_trgm similarity(): shared trigrams / all trigrams, words padded like Postgres does. */
function trigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (const w of s.split(/[^a-z0-9]+/).filter(Boolean)) {
    const p = `  ${w} `;
    for (let i = 0; i + 3 <= p.length; i++) out.add(p.slice(i, i + 3));
  }
  return out;
}
function similarity(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / (ta.size + tb.size - shared);
}

export class DemoCatalog {
  private deals: Map<string, DemoDeal>;
  constructor(
    private sets: DemoSet[],
    private offers: DemoOffer[],
    deals: DemoDeal[],
  ) {
    this.deals = new Map(deals.map((d) => [d.set_num, d]));
  }

  /** The `base` CTE: one row per set with its best current offer (optionally within some shops). */
  private base(shops?: string[]): Row[] {
    const bySet = new Map<string, DemoOffer[]>();
    for (const o of this.offers) {
      if (shops?.length && !shops.includes(o.shop_id)) continue;
      const list = bySet.get(o.set_num);
      if (list) list.push(o);
      else bySet.set(o.set_num, [o]);
    }
    const rows: Row[] = [];
    for (const s of this.sets) {
      const os = bySet.get(s.set_num);
      if (!os) continue;
      const inStock = os.filter((o) => o.in_stock);
      const best = [...inStock].sort((a, b) => a.price_rsd - b.price_rsd || a.shop_id.localeCompare(b.shop_id))[0];
      const bestPrice = best ? best.price_rsd : null;
      const deal = this.deals.get(s.set_num);
      rows.push({
        set_num: s.set_num,
        name: s.name,
        theme_slug: s.theme_slug,
        theme_name: s.theme_name,
        image_url: s.image_url,
        rrp_rsd: s.rrp_rsd,
        age_min: s.age_min,
        created_at: s.created_at,
        search_text: s.search_text,
        best_price: bestPrice,
        any_price: Math.min(...os.map((o) => o.price_rsd)),
        offers_in_stock: inStock.length,
        shops_in_stock: new Set(inStock.map((o) => o.shop_id)).size,
        shops: [...new Set(inStock.map((o) => o.shop_id))].sort(),
        shop_sale: inStock.some((o) => o.regular_price_rsd != null && o.regular_price_rsd > o.price_rsd),
        best_shop: best?.shop_id ?? null,
        best_seller: best?.seller ?? null,
        best_offer_id: best?.id ?? null,
        discount_pct:
          s.rrp_rsd && s.rrp_rsd > 0 && bestPrice !== null && bestPrice < s.rrp_rsd
            ? Math.round((100 * (s.rrp_rsd - bestPrice)) / s.rrp_rsd)
            : 0,
        deal_score: deal?.score ?? null,
        deal_rank: deal?.rank ?? null,
      });
    }
    return rows;
  }

  private filter(rows: Row[], f: SearchFilters, skipTheme: boolean): { rows: Row[]; qNorm: string } {
    const qNorm = normalizeText(f.q);
    const toks = qNorm.split(' ').filter(Boolean).slice(0, 8);
    const price = (r: Row) => r.best_price ?? r.any_price ?? 0;
    const ages = (f.ages ?? []).filter((a) => AGE_BUCKETS[a]);
    return {
      qNorm,
      rows: rows.filter((r) => {
        if (f.stock !== false && r.best_price === null) return false;
        if (f.setNums && !f.setNums.includes(r.set_num)) return false;
        if (toks.some((t) => !r.search_text.includes(t))) return false;
        if (!skipTheme && f.themes?.length && !f.themes.includes(r.theme_slug ?? '')) return false;
        if (f.min !== undefined && price(r) < f.min) return false;
        if (f.max !== undefined && price(r) > f.max) return false;
        if (f.sale && !(r.discount_pct >= 5 || r.shop_sale)) return false;
        if (ages.length) {
          const a = r.age_min;
          if (a === null || !ages.some((k) => a >= AGE_BUCKETS[k][0] && a < AGE_BUCKETS[k][1])) return false;
        }
        return true;
      }),
    };
  }

  search(f: SearchFilters) {
    const { rows, qNorm } = this.filter(this.base(f.shops), f, false);
    const sort = f.sort && SORTS.includes(f.sort) ? f.sort : qNorm ? 'relevance' : 'deal';
    const price = (r: Row) => r.best_price ?? r.any_price ?? 0;
    const scoreDesc = (a: Row, b: Row) => (b.deal_score ?? -Infinity) - (a.deal_score ?? -Infinity);
    const byNum = (a: Row, b: Row) => a.set_num.localeCompare(b.set_num);
    const cmp: Record<string, (a: Row, b: Row) => number> = {
      price_asc: (a, b) => price(a) - price(b) || byNum(a, b),
      price_desc: (a, b) => price(b) - price(a) || byNum(a, b),
      discount: (a, b) => b.discount_pct - a.discount_pct || Number(b.shop_sale) - Number(a.shop_sale) || scoreDesc(a, b) || byNum(a, b),
      newest: (a, b) => b.created_at.localeCompare(a.created_at) || byNum(b, a),
      name: (a, b) => a.name.localeCompare(b.name, 'sr-Latn'),
      deal: (a, b) => scoreDesc(a, b) || b.discount_pct - a.discount_pct || b.shops_in_stock - a.shops_in_stock || byNum(b, a),
    };
    let sorted: Row[];
    if (sort === 'relevance' && qNorm) {
      const sim = new Map(rows.map((r) => [r.set_num, similarity(r.search_text, qNorm)]));
      sorted = [...rows].sort(
        (a, b) =>
          Number(b.set_num === qNorm) - Number(a.set_num === qNorm) ||
          sim.get(b.set_num)! - sim.get(a.set_num)! ||
          scoreDesc(a, b) ||
          b.discount_pct - a.discount_pct ||
          byNum(a, b),
      );
    } else {
      sorted = [...rows].sort(cmp[sort] ?? cmp.deal);
    }
    const size = Math.min(Math.max(f.size ?? 24, 1), 96);
    const page = Math.max(f.page ?? 1, 1);
    const items: SetSummary[] = sorted
      .slice((page - 1) * size, page * size)
      .map(({ created_at: _c, search_text: _s, ...r }) => r);
    return { total: rows.length, page, size, sort, items };
  }

  facets(f: SearchFilters) {
    const themeRows = this.filter(this.base(f.shops), f, true).rows;
    const themeCounts = new Map<string | null, number>();
    for (const r of themeRows) themeCounts.set(r.theme_slug, (themeCounts.get(r.theme_slug) ?? 0) + 1);
    const shopRows = this.filter(this.base(), f, false).rows;
    const shopCounts = new Map<string, number>();
    for (const r of shopRows) for (const s of r.shops) shopCounts.set(s, (shopCounts.get(s) ?? 0) + 1);
    return {
      themes: [...themeCounts].map(([slug, count]) => ({ slug, count })),
      shops: [...shopCounts].map(([id, count]) => ({ id, count })),
    };
  }

  has(setNum: string): boolean {
    return this.sets.some((s) => s.set_num === setNum);
  }
}

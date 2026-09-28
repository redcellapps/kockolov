import { ageFromText } from '../../lib/setnum.js';
import type { CrawlContext, PageResult, RawOffer, ShopAdapter } from '../types.js';

// Ananas is a marketplace (many sellers). The LEGO brand page is server-rendered with the
// search results embedded as JSON (window[Symbol.for("InstantSearchInitialResults")]).
// Result paging on the site is not perfectly stable, so we walk the listing in several sort
// orders and merge by listing id — together they cover the full catalogue.

const IMAGE_HOST = 'https://static.ananas.rs';
const MARKER = 'window[Symbol.for("InstantSearchInitialResults")]';
export const ANANAS_SORTS = [
  'prod_merchant_inventories_sr_price_asc',
  'prod_merchant_inventories_sr_latest_desc',
  '', // site default ("Preporučeno")
];

interface AnanasHit {
  objectID: string;
  price: number;
  basePrice?: number;
  onSale?: boolean;
  onStock?: boolean;
  available?: number;
  merchant?: { displayName?: string };
  product: {
    name: string;
    slug: string;
    brand?: string;
    categoryNames?: string[];
    coverImageUrl?: string;
    thumbnailUrl?: string;
  };
}

interface AnanasResults {
  hits: AnanasHit[];
  nbHits: number;
  nbPages: number;
  page: number;
}

export function extractAnanasResults(html: string): AnanasResults | null {
  const at = html.indexOf(MARKER);
  if (at < 0) return null;
  const start = html.indexOf('{', at);
  const end = html.indexOf('</script>', start);
  if (start < 0 || end < 0) return null;
  let json = html.slice(start, end).trim();
  if (json.endsWith(';')) json = json.slice(0, -1);
  const data = JSON.parse(json) as Record<string, { results?: AnanasResults[] }>;
  for (const idx of Object.values(data)) {
    const r = idx?.results?.find((x) => Array.isArray(x.hits) && x.hits.some((h) => h?.product));
    if (r) return r;
    const empty = idx?.results?.find((x) => Array.isArray(x.hits));
    if (empty) return empty;
  }
  return null;
}

export function hitToOffer(h: AnanasHit, baseUrl: string): RawOffer | null {
  if (!h?.objectID || !h.product?.name || !h.product.slug) return null;
  if (h.product.brand && h.product.brand.toUpperCase() !== 'LEGO') return null;
  const price = Math.round(h.price);
  if (!price || price <= 0) return null;
  const base = h.basePrice ? Math.round(h.basePrice) : null;
  const img = h.product.coverImageUrl || h.product.thumbnailUrl || null;
  return {
    externalId: String(h.objectID),
    seller: (h.merchant?.displayName ?? '').trim(),
    title: h.product.name.trim(),
    url: `${baseUrl}/proizvod/${h.product.slug}/${h.objectID}`,
    imageUrl: img ? (img.startsWith('http') ? img : `${IMAGE_HOST}${img}`) : null,
    priceRsd: price,
    regularPriceRsd: base && base > price ? base : null,
    inStock: h.onStock !== false && (h.available === undefined || h.available > 0),
    stockQty: typeof h.available === 'number' ? h.available : null,
    sku: null,
    themeRaw: h.product.categoryNames ?? [],
    ageMin: ageFromText(h.product.name),
  };
}

export function ananasAdapter(baseUrl: string, sorts: string[] = ANANAS_SORTS): ShopAdapter {
  return {
    shop: { id: 'ananas', name: 'Ananas', url: 'https://ananas.rs', kind: 'marketplace' },
    async *crawl(ctx: CrawlContext): AsyncGenerator<PageResult> {
      const seen = new Set<string>();
      let pageCounter = 0;
      for (const sort of sorts) {
        let nbPages = 1;
        for (let page = 1; page <= Math.min(nbPages, ctx.maxPages); page++) {
          const qs = new URLSearchParams();
          if (sort) qs.set('sortBy', sort);
          if (page > 1) qs.set('page', String(page));
          const url = `${baseUrl}/brendovi/lego${qs.size ? `?${qs}` : ''}`;
          const { text } = await ctx.http.get(url);
          const results = extractAnanasResults(text);
          if (!results) throw new Error(`Ananas: search results not found in ${url} (page layout changed?)`);
          nbPages = results.nbPages || 1;
          const offers: RawOffer[] = [];
          for (const h of results.hits) {
            if (seen.has(h.objectID)) continue;
            const o = hitToOffer(h, baseUrl);
            if (!o) continue;
            seen.add(h.objectID);
            offers.push(o);
          }
          pageCounter++;
          yield { page: pageCounter, offers };
          if (!results.hits.length) break;
        }
      }
    },
  };
}

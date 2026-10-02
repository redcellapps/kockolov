import type { CrawlContext, PageResult, RawOffer, ShopAdapter } from '../types.js';

// Shoppster (SAP Commerce + Angular Spartacus, server-rendered). Every category page embeds the
// search result as Angular transfer state: <script id="ng-state" type="application/json">, at
// ["cx-state"].product.search.results → { products: [...], pagination: { currentPage (0-based),
// totalPages, totalResults } }. "Lego kocke" is category F1412, 36 products per page; the URL
// takes ?currentPage=N (1-based). The default "relevance" order shifts between requests (on
// 2 Oct 2026 four pages repeated 20 of 144 products and missed as many), so we ask for
// sortCode=name-asc, which pages cleanly (and is usually served from the shop's cache).
// robots.txt forbids /rest/*, /search/* and /offers/*, so we only read /c/ pages. It is a
// marketplace: in October 2026 every LEGO listing was sold by Kockarium doo (often with a
// Shoppster promo price).

const CATEGORY = '/c/F1412';

interface CxPrice {
  value?: number;
}
interface CxProduct {
  code?: string;
  name?: string;
  price?: CxPrice;
  salePrice?: CxPrice | null;
  productStatus?: string;
  stock?: { stockLevel?: number; stockLevelStatus?: string };
  vendor?: { name?: string };
  lastCategory?: { name?: string };
  images?: Record<string, Record<string, { url?: string }>>;
}
export interface ShoppsterResults {
  products: CxProduct[];
  pagination?: { currentPage?: number; totalPages?: number; totalResults?: number };
}

/** The search result embedded in a Shoppster category page (null if the page has none). */
export function extractShoppsterResults(html: string): ShoppsterResults | null {
  const m = html.match(/<script id="(?:ng-state|serverApp-state)" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) return null;
  let state: Record<string, unknown>;
  try {
    state = JSON.parse(m[1]);
  } catch {
    // older Angular versions escape the transfer state
    state = JSON.parse(
      m[1].replace(/&q;/g, '"').replace(/&s;/g, "'").replace(/&l;/g, '<').replace(/&g;/g, '>').replace(/&a;/g, '&'),
    );
  }
  const cx = state['cx-state'] as { product?: { search?: { results?: ShoppsterResults } } } | undefined;
  const res = cx?.product?.search?.results;
  return res && Array.isArray(res.products) ? res : null;
}

export function shoppsterProductToOffer(p: CxProduct, baseUrl: string): RawOffer | null {
  const code = p.code?.trim();
  const title = p.name?.replace(/\s+/g, ' ').trim();
  const regular = Math.round(p.price?.value ?? 0);
  const sale = Math.round(p.salePrice?.value ?? 0);
  const price = sale > 0 ? sale : regular;
  if (!code || !title || !(price > 0)) return null;
  const img = Object.values(p.images?.PRIMARY ?? {}).find((i) => i?.url)?.url ?? null;
  const status = p.stock?.stockLevelStatus;
  return {
    externalId: code,
    seller: p.vendor?.name?.trim() || 'Shoppster',
    title,
    url: `${baseUrl}/p/${code}`,
    imageUrl: img ? new URL(img, baseUrl).toString() : null,
    priceRsd: price,
    regularPriceRsd: regular > price ? regular : null,
    inStock: (p.productStatus ?? 'SALEABLE') === 'SALEABLE' && status !== 'outOfStock',
    stockQty: typeof p.stock?.stockLevel === 'number' ? p.stock.stockLevel : null,
    themeRaw: p.lastCategory?.name ? [p.lastCategory.name] : [],
  };
}

export function parseShoppsterPage(html: string, baseUrl: string): { offers: RawOffer[]; totalPages: number; found: boolean } {
  const res = extractShoppsterResults(html);
  if (!res) return { offers: [], totalPages: 0, found: false };
  const offers = res.products.map((p) => shoppsterProductToOffer(p, baseUrl)).filter((o): o is RawOffer => !!o);
  return { offers, totalPages: res.pagination?.totalPages ?? 1, found: true };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** pause before asking again for a page that came without data (tests set it to 0) */
export const shoppsterRetry = { attempts: 3, pauseMs: 5000 };

export function shoppsterAdapter(baseUrl = 'https://www.shoppster.rs'): ShopAdapter {
  return {
    shop: { id: 'shoppster', name: 'Shoppster', url: 'https://www.shoppster.rs', kind: 'marketplace', membersOnly: true },
    async *crawl(ctx: CrawlContext): AsyncGenerator<PageResult> {
      const seen = new Set<string>();
      let totalPages = 1;
      for (let page = 1; page <= Math.min(totalPages, ctx.maxPages); page++) {
        const url = `${baseUrl}${CATEGORY}?${page === 1 ? '' : `currentPage=${page}&`}sortCode=name-asc`;
        // When the shop's server-side rendering is slow it sends the bare app shell without the
        // embedded data (seen on 2 Oct 2026, page 18 of 28). Ask again a little later; if it still
        // has no data, fail the run so that nothing is marked unavailable.
        let parsed: ReturnType<typeof parseShoppsterPage> | null = null;
        for (let attempt = 1; attempt <= shoppsterRetry.attempts; attempt++) {
          const res = await ctx.http.get(url, { allow404: true });
          if (res.status === 404) return;
          const p = parseShoppsterPage(res.text, baseUrl);
          if (p.found) {
            parsed = p;
            break;
          }
          ctx.log(`stranica ${page} je stigla bez podataka (pokušaj ${attempt}/${shoppsterRetry.attempts})`);
          if (attempt < shoppsterRetry.attempts) await sleep(shoppsterRetry.pauseMs * attempt);
        }
        if (!parsed) throw new Error(`Shoppster: stranica ${page} je stigla bez podataka i posle ${shoppsterRetry.attempts} pokušaja`);
        if (page === 1) totalPages = parsed.totalPages;
        // keep each product once, in case the order still shifts a little
        const offers = parsed.offers.filter((o) => !seen.has(o.externalId));
        offers.forEach((o) => seen.add(o.externalId));
        if (!parsed.offers.length) return;
        yield { page, offers };
      }
    },
  };
}

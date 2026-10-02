import type { CrawlContext, PageResult, RawOffer, ShopAdapter } from '../types.js';

// Tehnomanija runs Magento 2 with a public GraphQL endpoint (/graphql, allowed by robots.txt).
// The LEGO category (id 284, about 200 products) comes back in a single GET with pageSize 250,
// so we never send currentPage (robots.txt disallows "*currentpage*"). Names end with the shop
// code "LE" + set number ("… Ferrari FXX K LE42212", sometimes glued: "SUVLE42213"). The API
// only returns products in stock. Every product has a special_price ~15% under its regular price.

const CATEGORY_ID = '284';
const PAGE_SIZE = 250;

export const TEHNOMANIJA_QUERY =
  `{products(filter:{category_id:{eq:"${CATEGORY_ID}"}},pageSize:${PAGE_SIZE}){total_count items{` +
  'sku name url_key url_suffix stock_status special_price ' +
  'price_range{minimum_price{regular_price{value} final_price{value}}} small_image{url}}}}';

interface MagentoItem {
  sku?: string;
  name?: string;
  url_key?: string;
  url_suffix?: string | null;
  stock_status?: string;
  special_price?: number | null;
  price_range?: { minimum_price?: { regular_price?: { value?: number }; final_price?: { value?: number } } };
  small_image?: { url?: string } | null;
}
interface MagentoResponse {
  data?: { products?: { total_count?: number; items?: MagentoItem[] } };
  errors?: { message: string }[];
}

/** "… LE42212" / "SUVLE42213" -> "42212" / "42213" (last occurrence) */
export const setNumFromTehnomanijaName = (name: string): string | null =>
  [...name.matchAll(/LE(\d{4,6})(?!\d)/g)].pop()?.[1] ?? null;

export function parseTehnomanija(json: MagentoResponse, baseUrl: string): RawOffer[] {
  if (json.errors?.length && !json.data?.products) throw new Error(`Tehnomanija GraphQL: ${json.errors[0].message}`);
  const out: RawOffer[] = [];
  for (const it of json.data?.products?.items ?? []) {
    const title = it.name?.replace(/\s+/g, ' ').trim();
    const final = it.price_range?.minimum_price?.final_price?.value;
    const price = Math.round(it.special_price ?? final ?? 0);
    if (!it.sku || !title || !it.url_key || !(price > 0)) continue;
    const regular = Math.round(it.price_range?.minimum_price?.regular_price?.value ?? 0);
    const img = it.small_image?.url;
    out.push({
      externalId: it.sku,
      title,
      url: `${baseUrl}/${it.url_key}${it.url_suffix ?? ''}`,
      imageUrl: img && !/placeholder/i.test(img) ? img : null,
      priceRsd: price,
      regularPriceRsd: regular > price ? regular : null,
      inStock: (it.stock_status ?? 'IN_STOCK') === 'IN_STOCK',
      sku: setNumFromTehnomanijaName(title),
    });
  }
  return out;
}

export function tehnomanijaAdapter(baseUrl = 'https://www.tehnomanija.rs'): ShopAdapter {
  return {
    shop: { id: 'tehnomanija', name: 'Tehnomanija', url: 'https://www.tehnomanija.rs', kind: 'shop', membersOnly: true },
    async *crawl(ctx: CrawlContext): AsyncGenerator<PageResult> {
      const json = await ctx.http.getJson<MagentoResponse>(`${baseUrl}/graphql?query=${encodeURIComponent(TEHNOMANIJA_QUERY)}`);
      const offers = parseTehnomanija(json, baseUrl);
      const total = json.data?.products?.total_count ?? 0;
      if (total > PAGE_SIZE) ctx.log(`tehnomanija: ${total} proizvoda, a čitamo prvih ${PAGE_SIZE}`);
      yield { page: 1, offers };
    },
  };
}

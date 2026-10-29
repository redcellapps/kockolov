import { HttpError } from '../../lib/http.js';
import { ageFromText } from '../../lib/setnum.js';
import type { CrawlContext, PageResult, RawOffer, ShopAdapter, ShopInfo } from '../types.js';

// WooCommerce Store API (/wp-json/wc/store/v1/products), public and read-only, used by Toyzzz,
// ABCKocka and Dečiji svet. Prices are strings in minor units ("274499" with currency_minor_unit 2 =
// 2.744,99 RSD). Pages: &page=N with per_page=100 (the API maximum) until an empty array comes back.
// Some shops' discount plugins leave `price` at the regular price and put the real one only in
// `sale_price` (Švrća, October 2026: price 209900, sale_price 178415, page shows 1.784,15), so the
// lower of the two is the price.

export interface WooStoreProduct {
  id: number;
  name: string;
  permalink: string;
  sku?: string;
  description?: string;
  short_description?: string;
  prices?: { price?: string; regular_price?: string; sale_price?: string; currency_minor_unit?: number };
  on_sale?: boolean;
  is_in_stock?: boolean;
  is_purchasable?: boolean;
  low_stock_remaining?: number | null;
  images?: { src?: string }[];
  categories?: { name?: string }[];
  tags?: { id?: number; name?: string }[];
}

const decodeEntities = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');

const stripHtml = (s: string | undefined) => decodeEntities((s ?? '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

const minor = (v: string | undefined, unit: number): number | null => {
  if (!v || !/^\d+$/.test(v)) return null;
  const n = Math.round(Number(v) / 10 ** unit);
  return n > 0 ? n : null;
};

/** Set number in an image file name: "LE31146.jpg", "41737.jpg", "77264_box1_v29.webp" */
export function setNumFromImage(src: string | undefined): string | null {
  const file = (src ?? '').split('?')[0].split('/').pop() ?? '';
  return file.match(/^(?:LE)?(\d{4,6})(?![\d])/i)?.[1] ?? null;
}

export interface WooOptions {
  /**
   * false when the shop's SKU is its own internal code (Dečiji svet: "11852" for set 60400). The set
   * number then comes from the title only; an image name number is just a guess.
   */
  skuIsSetNum?: boolean;
  /** every category is a theme (Dečiji svet files sets under "City", "Friends"… without "LEGO") */
  allCategoriesAreThemes?: boolean;
}

const titleNum = (title: string) => title.match(/(?<![\d.,])(\d{5,6})(?![\d])/)?.[1] ?? null;

/**
 * The shop's SKU is usually the set number, but not always right (Toyzzz lists "41734" for set
 * 41737, whose number is in the image name and the description). When the SKU disagrees with a
 * number in the title or the image name, those win.
 */
function bestSku(p: WooStoreProduct, title: string): string | null {
  const sku = p.sku?.trim() || null;
  // a single minifigure under its BrickLink id ("sw0360", "frnd0660"): not a set
  if (sku && /^[a-z]{2,5}\d{2,4}[a-z]?$/i.test(sku)) return sku;
  const fromTitle = titleNum(title);
  const fromImage = setNumFromImage(p.images?.[0]?.src);
  if (sku && (sku === fromTitle || sku === fromImage || (!fromTitle && !fromImage))) return sku;
  return fromTitle ?? fromImage ?? sku;
}

export function wooProductToOffer(p: WooStoreProduct, opts: WooOptions = {}): RawOffer | null {
  const title = stripHtml(p.name);
  const unit = p.prices?.currency_minor_unit ?? 2;
  const listed = minor(p.prices?.price, unit);
  const sale = minor(p.prices?.sale_price, unit);
  const price = listed && sale && sale < listed ? sale : listed;
  if (!p.id || !title || !price || !p.permalink) return null;
  const regular = Math.max(minor(p.prices?.regular_price, unit) ?? 0, listed ?? 0) || null;
  const themes = (p.categories ?? [])
    .map((c) => stripHtml(c.name))
    .filter((n) => opts.allCategoriesAreThemes || /lego/i.test(n));
  const own = opts.skuIsSetNum === false;
  const fromTitle = own ? titleNum(title) : null;
  return {
    externalId: String(p.id),
    title,
    url: p.permalink,
    imageUrl: p.images?.[0]?.src ?? null,
    priceRsd: price,
    regularPriceRsd: regular && regular > price ? regular : null,
    inStock: p.is_in_stock !== false && p.is_purchasable !== false,
    stockQty: typeof p.low_stock_remaining === 'number' ? p.low_stock_remaining : null,
    sku: own ? fromTitle : bestSku(p, title),
    skuGuess: own && !fromTitle ? setNumFromImage(p.images?.[0]?.src) : null,
    themeRaw: themes, // "LEGO® Speed Champions", "LEGO® modeli za odrasle"… (the theme mapper picks the known one)
    ageMin: ageFromText(stripHtml(p.description)) ?? ageFromText(stripHtml(p.short_description)) ?? ageFromText(title),
  };
}

export function wooStoreAdapter(
  shop: ShopInfo,
  baseUrl: string,
  /** each listing to walk (e.g. a tag and a search), merged by product id */
  listings: string[],
  keep: (p: WooStoreProduct) => boolean = () => true,
  opts: WooOptions = {},
): ShopAdapter {
  return {
    shop,
    async *crawl(ctx: CrawlContext): AsyncGenerator<PageResult> {
      const seen = new Set<number>();
      let n = 0;
      for (const listing of listings) {
        for (let page = 1; page <= ctx.maxPages; page++) {
          const sep = listing ? `${listing}&` : '';
          const url = `${baseUrl}/wp-json/wc/store/v1/products?${sep}per_page=100&page=${page}`;
          // past the last page WooCommerce answers [] (some versions: 400 "page number too large")
          let items: WooStoreProduct[];
          try {
            const res = await ctx.http.get(url, { allow404: true });
            if (res.status === 404) break;
            items = JSON.parse(res.text);
          } catch (err) {
            if (err instanceof HttpError && err.status === 400 && page > 1) break;
            throw err;
          }
          if (!Array.isArray(items) || !items.length) break;
          const offers = items
            .filter((p) => !seen.has(p.id) && keep(p))
            .map((p) => {
              seen.add(p.id);
              return wooProductToOffer(p, opts);
            })
            .filter((o): o is RawOffer => !!o);
          yield { page: ++n, offers };
          if (items.length < 100) break;
        }
      }
    },
  };
}

const TOYZZZ_LEGO_TAG = 530;

export const toyzzzAdapter = (baseUrl = 'https://toyzzz.rs') =>
  wooStoreAdapter(
    { id: 'toyzzz', name: 'Toyzzz', url: 'https://toyzzz.rs', kind: 'shop', membersOnly: true },
    baseUrl,
    // the LEGO tag misses some sets, the search finds them; the search also matches non-LEGO
    // products that only mention LEGO in the description, so those must say LEGO in the name
    [`tag=${TOYZZZ_LEGO_TAG}`, 'search=lego'],
    (p) => /\blego\b/i.test(p.name) || !!p.tags?.some((t) => t.id === TOYZZZ_LEGO_TAG || /^lego$/i.test(t.name ?? '')),
  );

export const abckockaAdapter = (baseUrl = 'https://abckocka.com') =>
  wooStoreAdapter(
    { id: 'abckocka', name: 'ABC Kocka', url: 'https://abckocka.com', kind: 'shop', membersOnly: true },
    baseUrl,
    [''], // the whole catalogue: mostly LEGO, but also Barbie and Nerf (October 2026)
    (p) => /\blego\b/i.test(p.name) || !!p.categories?.some((c) => /\blego\b/i.test(c.name ?? '')),
  );

/** Dečiji svet (Novi Sad): the LEGO category; its SKUs are internal codes, the set number is in the title. */
const DECIJISVET_LEGO_CATEGORY = 444;

export const decijisvetAdapter = (baseUrl = 'https://decijisvetigracke.rs') =>
  wooStoreAdapter(
    { id: 'decijisvet', name: 'Dečiji svet', url: 'https://decijisvetigracke.rs', kind: 'shop', membersOnly: true },
    baseUrl,
    [`category=${DECIJISVET_LEGO_CATEGORY}`],
    // the category also holds a few other brands' toys ("GOO JIT ZU MINECRAFT S4 HERO FIGURA")
    (p) => /\blego\b/i.test(p.name),
    { skuIsSetNum: false, allCategoriesAreThemes: true },
  );

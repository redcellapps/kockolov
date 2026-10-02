import * as cheerio from 'cheerio';
import { parseRsd } from '../../lib/normalize.js';
import type { CrawlContext, PageResult, RawOffer, ShopAdapter, ShopInfo } from '../types.js';
import { absUrl, setNumFromLeCode, themeFromCategory } from './paging.js';

// NBSHOP (Serbian e-commerce platform by NB Soft) — Dexy Co, Kockalend and Baby Park. Every product card
// in a listing carries its data as attributes: data-productid, data-productcode ("LE42215",
// i.e. "LE" + the LEGO set number), data-productname, data-productprice ("25.499,00"),
// data-productprevprice and data-productcat. Listings only show products in stock.
// Pages: /lego-kocke, then /lego-kocke/page-N. Shops number them differently: on Dexy /page-1
// is the second page, on Kockalend /page-1 repeats the first and /page-2 is the second. Past the
// end: 404 or an empty listing.

export function parseNbshopPage(html: string, baseUrl: string): RawOffer[] {
  const $ = cheerio.load(html);
  const out = new Map<string, RawOffer>();
  $('[data-productid][data-productprice]').each((_, el) => {
    const $el = $(el);
    const id = ($el.attr('data-productid') ?? '').trim();
    const title = ($el.attr('data-productname') ?? '').replace(/\s+/g, ' ').trim();
    const price = parseRsd($el.attr('data-productprice'));
    if (!id || !title || !price || out.has(id)) return;
    // listings also carry "recommended" products from other categories (Baby Park: car seats);
    // LEGO products are the ones coded "LE" + set number
    const sku = setNumFromLeCode($el.attr('data-productcode'));
    if (!sku) return;
    const prev = parseRsd($el.attr('data-productprevprice'));
    const href = $el
      .find('a[href]')
      .map((_, a) => $(a).attr('href'))
      .get()
      .find((h) => new RegExp(`/${id}-[^/]+$`).test(h.split('?')[0]));
    const url = absUrl(baseUrl, href);
    if (!url) return;
    const img = $el
      .find('img')
      .map((_, i) => $(i).attr('data-src') || $(i).attr('src'))
      .get()
      .find((s) => s && /slike_proizvoda/.test(s) && !/no_image/i.test(s));
    out.set(id, {
      externalId: id,
      title,
      url,
      imageUrl: absUrl(baseUrl, img),
      priceRsd: price,
      regularPriceRsd: prev && prev > price ? prev : null,
      inStock: true,
      sku,
      themeRaw: themeFromCategory($el.attr('data-productcat')),
    });
  });
  return [...out.values()];
}

export function nbshopAdapter(shop: ShopInfo, baseUrl: string, listPath = '/lego-kocke'): ShopAdapter {
  return {
    shop,
    async *crawl(ctx: CrawlContext): AsyncGenerator<PageResult> {
      const seen = new Set<string>();
      let num = 0; // number in the URL; 0 = the base listing
      for (let page = 1; page <= ctx.maxPages; num++) {
        const res = await ctx.http.get(num === 0 ? `${baseUrl}${listPath}` : `${baseUrl}${listPath}/page-${num}`, {
          allow404: true,
        });
        if (res.status === 404) return;
        const all = parseNbshopPage(res.text, baseUrl);
        const offers = all.filter((o) => !seen.has(o.externalId));
        if (!offers.length) {
          if (num === 1 && all.length) continue; // /page-1 repeated the first page: the second is /page-2
          return;
        }
        offers.forEach((o) => seen.add(o.externalId));
        yield { page: page++, offers };
      }
    },
  };
}

export const dexyAdapter = (baseUrl = 'https://www.dexy.co.rs') =>
  nbshopAdapter({ id: 'dexy', name: 'Dexy Co', url: 'https://www.dexy.co.rs', kind: 'shop', membersOnly: true }, baseUrl);

export const kockalendAdapter = (baseUrl = 'https://www.kockalend.rs') =>
  nbshopAdapter({ id: 'kockalend', name: 'Kockalend', url: 'https://www.kockalend.rs', kind: 'shop', membersOnly: true }, baseUrl);

export const babyparkAdapter = (baseUrl = 'https://www.babypark.rs') =>
  nbshopAdapter({ id: 'babypark', name: 'Baby Park', url: 'https://www.babypark.rs', kind: 'shop', membersOnly: true }, baseUrl);

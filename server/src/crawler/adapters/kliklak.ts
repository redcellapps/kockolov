import * as cheerio from 'cheerio';
import { parseRsd } from '../../lib/normalize.js';
import type { CrawlContext, PageResult, RawOffer, ShopAdapter } from '../types.js';
import { absUrl, pageThrough } from './paging.js';

// Kliklak (shop on the ShopMania platform), server-rendered. The brand page /lego lists 48
// products per page (/lego/p2, /lego/p3…) and also a few non-LEGO products that mention LEGO,
// so we keep titles that start with "Lego". Titles carry the set number in brackets:
// "Lego srednja kofica kreativnih kockica ( 10696 )", "( LE10698 )". robots.txt asks for
// Crawl-delay: 5, which the fetcher honours. Its listing pages are slow (about 40 s each on
// 2 Oct 2026, 35 pages), so they get a longer timeout and the shop is crawled last.

export function parseKliklakPage(html: string, baseUrl: string): RawOffer[] {
  const $ = cheerio.load(html);
  const out = new Map<string, RawOffer>();
  $('.product.product--grid').each((_, el) => {
    const $el = $(el);
    const $a = $el.find('a.product__name').first();
    const href = $a.attr('href');
    const title = $a.text().replace(/\s+/g, ' ').trim();
    const id = $el.find('[data-wishlist-toggle]').attr('data-wishlist-toggle') ?? href?.split('?')[0];
    if (!href || !title || !id || out.has(id) || !/^lego\b/i.test(title)) return;
    const price = parseRsd($el.find('.product__info--price-gross').first().text());
    if (!price) return;
    const old = parseRsd($el.find('.product__info--old-price-gross').first().text());
    const $img = $el.find('.grid-image img').first();
    out.set(id, {
      externalId: id,
      title,
      url: absUrl(baseUrl, href)!,
      imageUrl: absUrl(baseUrl, $img.attr('data-src') || $img.attr('src')?.replace(/.*no_image\.svg$/, '')),
      priceRsd: price,
      regularPriceRsd: old && old > price ? old : null,
      inStock: $el.find('.product__add-to-cart').length > 0,
    });
  });
  return [...out.values()];
}

export function kliklakAdapter(baseUrl = 'https://www.kliklak.rs'): ShopAdapter {
  return {
    shop: { id: 'kliklak', name: 'Kliklak', url: 'https://www.kliklak.rs', kind: 'shop', membersOnly: true },
    crawl(ctx: CrawlContext): AsyncGenerator<PageResult> {
      const slow = { ...ctx, http: { get: (url: string, o = {}) => ctx.http.get(url, { timeoutMs: 120_000, ...o }) } as typeof ctx.http };
      return pageThrough(
        slow,
        (page) => `${baseUrl}/lego${page === 1 ? '' : `/p${page}`}`,
        (html) => parseKliklakPage(html, baseUrl),
      );
    },
  };
}

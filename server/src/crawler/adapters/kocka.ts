import * as cheerio from 'cheerio';
import { parseRsd } from '../../lib/normalize.js';
import type { CrawlContext, PageResult, RawOffer, ShopAdapter } from '../types.js';
import { absUrl, pageThrough } from './paging.js';

// Kocka.rs (Subotica) sells new sealed sets. Listing: /sr/lego-kocke/proizvodi/1?page=N, 15 per
// page (the old /lego-kocke/kategorija/1 redirects there). Each card is a
// <div class="products__list-item"><section class="product__box">; the title link carries
// data-code (the LEGO set number) and data-price (what you pay), the title starts with the number
// ("75445 Svemirski brod Anzelana"). The shop was redesigned in October 2026 (cards were
// .products-item before), which made the crawler find nothing.

/** "8 550.00 RSD" / "9.500,00" -> 8550 / 9500. */
function priceOf(raw: string | undefined | null): number | null {
  const s = (raw ?? '').replace(/rsd|din\.?/gi, '').replace(/[\s\u00a0]/g, '');
  if (!s) return null;
  const n = /,\d{1,2}$/.test(s) ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

export function parseKockaPage(html: string, baseUrl: string): RawOffer[] {
  const $ = cheerio.load(html);
  const out = new Map<string, RawOffer>();
  $('.products__list .product__box').each((_, el) => {
    const $el = $(el);
    const $a = $el.find('a.js-product-name, .product__box-heading a').first();
    const href = $a.attr('href') ?? $el.find('.product__box-image a').attr('href') ?? '';
    const id = href.split('?')[0].match(/\/proizvod\/(\d+)/)?.[1];
    const title = $a.text().replace(/\s+/g, ' ').trim();
    if (!id || !title || out.has(id)) return;
    // on sale: .product__price--old holds the price before, .product__price--current what you pay
    const price = priceOf($el.find('.product__price--current').first().text()) ?? priceOf($a.attr('data-price'));
    if (!price) return;
    const before = priceOf($el.find('.product__price--old-price').first().text());
    const code = ($a.attr('data-code') ?? '').trim() || title.match(/^(\d{4,6})\b/)?.[1] || '';
    const $img = $el.find('.product__box-image img').first();
    const soldOut = !$el.find('.product__box-add-to-cart').length || /rasprodat|nema na stanju/i.test($el.find('.product__box-footer').text());
    out.set(id, {
      externalId: id,
      title,
      url: absUrl(baseUrl, href)!,
      imageUrl: absUrl(baseUrl, $img.attr('data-src') || $img.attr('src')),
      priceRsd: price,
      regularPriceRsd: before && before > price ? before : null,
      inStock: !soldOut,
      sku: /^\d{4,6}(-\w{1,3})?$/.test(code) ? code : null,
    });
  });
  return [...out.values()];
}

export function kockaAdapter(baseUrl = 'https://kocka.rs'): ShopAdapter {
  return {
    shop: { id: 'kocka', name: 'Kocka.rs', url: 'https://kocka.rs', kind: 'shop', membersOnly: true },
    crawl(ctx: CrawlContext): AsyncGenerator<PageResult> {
      return pageThrough(
        ctx,
        (page) => `${baseUrl}/sr/lego-kocke/proizvodi/1${page === 1 ? '' : `?page=${page}`}`,
        (html) => parseKockaPage(html, baseUrl),
      );
    },
  };
}

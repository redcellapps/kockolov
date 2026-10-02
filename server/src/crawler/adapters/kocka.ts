import * as cheerio from 'cheerio';
import { parseRsd } from '../../lib/normalize.js';
import type { CrawlContext, PageResult, RawOffer, ShopAdapter } from '../types.js';
import { absUrl, pageThrough } from './paging.js';

// Kocka.rs (Subotica) sells new sealed sets. Listing: /lego-kocke/kategorija/1?page=N, 15 per
// page. Each card states "Šifra proizvoda: 71048" — the LEGO set number — and the title starts
// with it ("71048: LEGO Minifigures – Series 27").

export function parseKockaPage(html: string, baseUrl: string): RawOffer[] {
  const $ = cheerio.load(html);
  const out = new Map<string, RawOffer>();
  $('.products__list > .products-item').each((_, el) => {
    const $el = $(el);
    const $a = $el.find('a.products-item__title').first();
    const href = $a.attr('href') ?? $el.find('a.products-item__image').attr('href') ?? '';
    const id = href.split('?')[0].match(/\/proizvod\/(\d+)/)?.[1];
    const title = $a.text().replace(/\s+/g, ' ').trim();
    if (!id || !title || out.has(id)) return;
    const price = parseRsd($el.find('.products-item__price').first().text());
    if (!price) return;
    const code = $el.find('.products-item__code').text().replace(/^.*?:\s*/, '').trim();
    const $img = $el.find('a.products-item__image img').first();
    const soldOut = !$el.find('.products-item__to-cart').length || /rasprodat|nema na stanju/i.test($el.text());
    out.set(id, {
      externalId: id,
      title,
      url: absUrl(baseUrl, href)!,
      imageUrl: absUrl(baseUrl, $img.attr('data-src') || $img.attr('src')?.replace(/.*blank\.png$/, '')),
      priceRsd: price,
      regularPriceRsd: null,
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
        (page) => `${baseUrl}/lego-kocke/kategorija/1${page === 1 ? '' : `?page=${page}`}`,
        (html) => parseKockaPage(html, baseUrl),
      );
    },
  };
}

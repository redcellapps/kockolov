import * as cheerio from 'cheerio';
import { parseRsd } from '../../lib/normalize.js';
import type { CrawlContext, PageResult, RawOffer, ShopAdapter } from '../types.js';
import { absUrl, pageThrough } from './paging.js';

// Pertini Toys: custom shop, server-rendered. The LEGO category pages by offset
// (?od_=0&po_=40, 40 is the most it gives). Out-of-stock products are left out of the category.
// Titles carry no set number ("LEGO TECHNIC Ducati Desmo450 MX Factory"), but the product image
// is named after the set: "lego-technic-ducati-…-42238-ducati-…-w_6a748b19cbe68.jpg",
// "lego-sonic-…-77006-box1-v29_69baac5859200.jpg".

const PER_PAGE = 40;

/** The set number in a Pertini image file name (null if there is none) */
export function setNumFromPertiniImage(src: string | null | undefined): string | null {
  const file = (src ?? '').split('?')[0].split('/').pop() ?? '';
  const stem = file.replace(/_[0-9a-f]{10,16}\.\w+$/i, '').replace(/\.\w+$/, '');
  return stem.match(/(?:^|-)(\d{5,6})(?=-|$)/)?.[1] ?? null;
}

export function parsePertiniPage(html: string, baseUrl: string): RawOffer[] {
  const $ = cheerio.load(html);
  const out = new Map<string, RawOffer>();
  $('.product-list-4 .one-product').each((_, el) => {
    const $el = $(el);
    const $a = $el.find('.product-text-details a[href*="product--"]').first();
    const href = $a.attr('href') ?? '';
    const id = href.split('?')[0].match(/product--([\w-]+)/)?.[1];
    const title = ($a.find('h3').text() || $a.text()).replace(/\s+/g, ' ').trim();
    if (!id || !title || out.has(id)) return;
    const price = parseRsd($el.find('.product-text-details .price').first().text());
    if (!price) return;
    const img = $el.find('img.photo').attr('src');
    out.set(id, {
      externalId: id,
      title,
      url: absUrl(baseUrl, href)!,
      imageUrl: absUrl(baseUrl, img),
      priceRsd: price,
      regularPriceRsd: null,
      inStock: true,
      // the picture's name usually carries the set number, but not always (old internal codes)
      skuGuess: setNumFromPertiniImage(img),
    });
  });
  return [...out.values()];
}

export function pertiniAdapter(baseUrl = 'https://www.pertinitoys.com'): ShopAdapter {
  return {
    shop: { id: 'pertini', name: 'Pertini Toys', url: 'https://www.pertinitoys.com', kind: 'shop', membersOnly: true },
    crawl(ctx: CrawlContext): AsyncGenerator<PageResult> {
      return pageThrough(
        ctx,
        (page) => `${baseUrl}/shop/kategorija_lego-kocke?od_=${(page - 1) * PER_PAGE}&po_=${PER_PAGE}`,
        (html) => parsePertiniPage(html, baseUrl),
      );
    },
  };
}

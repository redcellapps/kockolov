import * as cheerio from 'cheerio';
import { ageFromText } from '../../lib/setnum.js';
import { parseRsd } from '../../lib/normalize.js';
import type { CrawlContext, PageResult, RawOffer, ShopAdapter } from '../types.js';
import { absUrl, pageThrough } from './paging.js';

// BigBang (BC Group) sells LEGO from its own stock. The listing is server-rendered:
// /lego-kocke, /lego-kocke-p2, /lego-kocke-p3… Each card is an <a class="product"> (the ones
// inside .swiper are a "recommended" carousel, not the listing). The regular price is the
// first span in .price ("10.099<sup>00</sup> RSD"); the second is a club ("VIP") price, which
// we ignore. Titles usually carry the set number ("LEGO 42197 Bager-utovarivač").

export function parseBigbangPage(html: string, baseUrl: string): RawOffer[] {
  const $ = cheerio.load(html);
  const out = new Map<string, RawOffer>();
  $('a.product').each((_, el) => {
    const $el = $(el);
    if ($el.closest('.swiper').length) return;
    const href = $el.attr('href') ?? '';
    const id = href.split('?')[0].match(/-(\d+)\/?$/)?.[1];
    const title = ($el.find('.product__title').text() || $el.attr('title') || '').replace(/\s+/g, ' ').trim();
    if (!id || !title || out.has(id)) return;
    // own text of the first price span: "10.099" + " RSD" around <sup>00</sup>
    const $span = $el.find('.product__price .price > span').first();
    const priceText = $span.contents().filter((_, n) => n.type === 'text').text();
    const price = parseRsd(priceText);
    if (!price) return;
    const $img = $el.find('.product__image img').first();
    const extra = $el.find('.product__extra').text();
    out.set(id, {
      externalId: id,
      title,
      url: absUrl(baseUrl, href)!,
      imageUrl: absUrl(baseUrl, $img.attr('data-lazy-load-src') || $img.attr('src')),
      priceRsd: price,
      regularPriceRsd: null,
      inStock: !/nije dostupan|nema na stanju/i.test($el.text()),
      ageMin: ageFromText(extra.match(/Uzrast\s*([\d.,]+\+?)/i)?.[1]),
    });
  });
  return [...out.values()];
}

export function bigbangAdapter(baseUrl = 'https://www.bigbang.rs'): ShopAdapter {
  return {
    shop: { id: 'bigbang', name: 'BigBang', url: 'https://www.bigbang.rs', kind: 'shop', membersOnly: true },
    crawl(ctx: CrawlContext): AsyncGenerator<PageResult> {
      return pageThrough(
        ctx,
        (page) => (page === 1 ? `${baseUrl}/lego-kocke` : `${baseUrl}/lego-kocke-p${page}`),
        (html) => parseBigbangPage(html, baseUrl),
      );
    },
  };
}

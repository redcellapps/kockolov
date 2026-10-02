import * as cheerio from 'cheerio';
import { ageFromText } from '../../lib/setnum.js';
import { parseRsd } from '../../lib/normalize.js';
import type { CrawlContext, PageResult, RawOffer, ShopAdapter } from '../types.js';
import { absUrl, pageThrough } from './paging.js';

// eKupi runs on SAP Commerce (Hybris). The LEGO category lists 25 products per page;
// ?page=N is 1-based (page=0 and page=1 are the same). robots.txt forbids ?q= and page combined
// with other parameters, so we only ever add ?page=N. Titles end with the set number.

const LIST_PATH = '/rs/igracke-i-decija-oprema/igracke/lego/c/10388';

export function parseEkupiPage(html: string, baseUrl: string): RawOffer[] {
  const $ = cheerio.load(html);
  const out = new Map<string, RawOffer>();
  $('.product__listing .product-item').each((_, el) => {
    const $el = $(el);
    const href = $el.find('a.thumb').attr('href') || $el.find('a.name').attr('href') || '';
    const id = href.split('?')[0].match(/\/p\/([A-Z0-9]+)/i)?.[1];
    const title = $el.find('a.name').text().replace(/\s+/g, ' ').trim() || $el.find('a.thumb').attr('title')?.trim() || '';
    if (!id || !title || out.has(id)) return;
    const price = parseRsd($el.find('.price-block .price').first().contents().filter((_, n) => n.type === 'text').text());
    if (!price) return;
    const old = parseRsd($el.find('.price-block .item-old-price').first().text().replace(/\s+/g, ' '));
    const facts = $el
      .find('.product__listing--description li')
      .map((_, li) => $(li).text().replace(/\s+/g, ' ').trim())
      .get();
    const theme = facts.find((f) => /^Tema:/i.test(f))?.replace(/^Tema:\s*/i, '');
    const age = facts.find((f) => /^Uzrasna granica:/i.test(f))?.replace(/^Uzrasna granica:\s*/i, '');
    out.set(id, {
      externalId: id,
      title,
      url: absUrl(baseUrl, href)!,
      imageUrl: absUrl(baseUrl, $el.find('a.thumb > img').attr('src')),
      priceRsd: price,
      regularPriceRsd: old && old > price ? old : null,
      inStock: !/nedostupan|nema na stanju/i.test($el.text()),
      themeRaw: theme ? [theme] : [],
      ageMin: ageFromText(age),
    });
  });
  return [...out.values()];
}

export function ekupiAdapter(baseUrl = 'https://www.ekupi.rs'): ShopAdapter {
  return {
    shop: { id: 'ekupi', name: 'eKupi', url: 'https://www.ekupi.rs', kind: 'shop', membersOnly: true },
    crawl(ctx: CrawlContext): AsyncGenerator<PageResult> {
      return pageThrough(
        ctx,
        (page) => (page === 1 ? `${baseUrl}${LIST_PATH}` : `${baseUrl}${LIST_PATH}?page=${page}`),
        (html) => parseEkupiPage(html, baseUrl),
      );
    },
  };
}

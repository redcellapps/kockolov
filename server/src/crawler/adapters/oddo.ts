import * as cheerio from 'cheerio';
import { parseRsd } from '../../lib/normalize.js';
import type { CrawlContext, PageResult, RawOffer, ShopAdapter } from '../types.js';
import { absUrl, pageThrough } from './paging.js';

// ODDO igračke: toy shop with its own stock, custom platform (Web Factory), server-rendered.
// The LEGO brand page /lego-brend lists 24 products per page (?p=N). Each card shows the
// regular price ("Redovna cena: 2.699 RSD") and the shop's own lower price ("ODDO cena:
// 2.564 RSD"), and titles end with the set number as "LE10349". Links and images are relative.

const LIST_PATH = '/lego-brend';

const rsdIn = (text: string) => parseRsd(text.match(/(\d{1,3}(?:\.\d{3})*(?:,\d+)?|\d+)\s*RSD/i)?.[1]);

export function parseOddoPage(html: string, baseUrl: string): RawOffer[] {
  const $ = cheerio.load(html);
  const base = `${baseUrl}/`;
  const out = new Map<string, RawOffer>();
  $('.homeIzdvojeniProizvod').each((_, el) => {
    const $el = $(el);
    const $a = $el.find('a.homeIzdvojeniProizvodTitle').first();
    const href = $a.attr('href');
    const title = $a.text().replace(/\s+/g, ' ').trim();
    const price = rsdIn($el.find('.proizvodPreviewAktuelnaCena').first().text());
    if (!href || !title || !price) return;
    const cartId = $el.find('a.proizvodDodajUKorpuSmall').attr('href')?.match(/addToCart\('(\d+)'/)?.[1];
    const id = cartId ?? href.split('?')[0];
    if (out.has(id)) return;
    const regular = rsdIn($el.find('.homeIzdvojeniProizvodCena').first().text());
    out.set(id, {
      externalId: id,
      title,
      url: absUrl(base, href)!,
      imageUrl: absUrl(base, $el.find('a.homeIzdvojeniProizvodThumb img').attr('src')),
      priceRsd: price,
      regularPriceRsd: regular && regular > price ? regular : null,
      // sold-out products have no "Kupi" button
      inStock: $el.find('a.proizvodDodajUKorpuSmall').length > 0,
      // "… LE10349" in the title, or in the link: "…-le11024", "…-tanosa-76319-1045131"
      sku:
        title.match(/\bLE(\d{4,6})\b/i)?.[1] ??
        href.match(/-le(\d{4,6})(?:-|$)/i)?.[1] ??
        href.match(/-(\d{5,6})-\d+$/)?.[1] ??
        null,
    });
  });
  return [...out.values()];
}

export function oddoAdapter(baseUrl = 'https://www.oddoigracke.rs'): ShopAdapter {
  return {
    shop: { id: 'oddo', name: 'ODDO igračke', url: 'https://www.oddoigracke.rs', kind: 'shop', membersOnly: true },
    crawl(ctx: CrawlContext): AsyncGenerator<PageResult> {
      return pageThrough(
        ctx,
        (page) => `${baseUrl}${LIST_PATH}${page === 1 ? '' : `?p=${page}`}`,
        (html) => parseOddoPage(html, baseUrl),
      );
    },
  };
}

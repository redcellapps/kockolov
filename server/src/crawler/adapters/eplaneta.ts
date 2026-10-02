import * as cheerio from 'cheerio';
import { parseRsd } from '../../lib/normalize.js';
import type { CrawlContext, PageResult, RawOffer, ShopAdapter } from '../types.js';
import { absUrl } from './paging.js';

// ePlaneta (Magento 2). The product grid gets its prices from JavaScript, but every category page
// also carries a schema.org ItemList (JSON-LD) with name, URL, image and price for each of its
// 36 products. Discounted products show the old price in the card (".old-price", "1849.99 RSD").
// Pages: ?p=N (allowed by robots.txt); past the last page the ItemList is missing.
// The GraphQL API returns price 0 for these products, so we don't use it.

const LIST_PATH = '/igracke/lego-prodavnica/lego-kocke.html';

interface LdProduct {
  '@type'?: string;
  name?: string;
  url?: string;
  image?: string;
  offers?: { price?: number | string; availability?: string };
}

export function parseEplanetaPage(html: string, baseUrl: string): RawOffer[] {
  const $ = cheerio.load(html);
  let items: LdProduct[] = [];
  $('script[type="application/ld+json"]').each((_, s) => {
    try {
      const j = JSON.parse($(s).text());
      if (j?.['@type'] === 'ItemList' && Array.isArray(j.itemListElement)) items = j.itemListElement;
    } catch {
      /* other JSON-LD blocks */
    }
  });
  // old prices from the cards, by product URL
  const old = new Map<string, number>();
  $('.product-item-info').each((_, el) => {
    const $el = $(el);
    const href = $el.find('a[href$=".html"]').first().attr('href');
    const o = parseRsd($el.find('.old-price').first().text());
    if (href && o) old.set(href.split('?')[0], o);
  });
  const out = new Map<string, RawOffer>();
  for (const it of items) {
    const url = it.url?.split('?')[0];
    const title = it.name?.replace(/\s+/g, ' ').trim();
    const price = parseRsd(it.offers?.price ?? null);
    if (!url || !title || !price) continue;
    // "…-84144.html", marketplace products "…-ep3092728.html"
    const id = url.match(/-((?:ep)?\d+)\.html$/i)?.[1] ?? url.replace(/^.*\//, '').replace(/\.html$/, '');
    if (out.has(id)) continue;
    const regular = old.get(url) ?? null;
    out.set(id, {
      externalId: id,
      title,
      url: absUrl(baseUrl, url)!,
      imageUrl: absUrl(baseUrl, it.image?.startsWith('//') ? `https:${it.image}` : it.image),
      priceRsd: price,
      regularPriceRsd: regular && regular > price ? regular : null,
      inStock: !/OutOfStock/i.test(it.offers?.availability ?? ''),
    });
  }
  return [...out.values()];
}

export function eplanetaAdapter(baseUrl = 'https://eplaneta.rs'): ShopAdapter {
  return {
    shop: { id: 'eplaneta', name: 'ePlaneta', url: 'https://eplaneta.rs', kind: 'shop', membersOnly: true },
    async *crawl(ctx: CrawlContext): AsyncGenerator<PageResult> {
      const seen = new Set<string>();
      for (let page = 1; page <= ctx.maxPages; page++) {
        const res = await ctx.http.get(`${baseUrl}${LIST_PATH}${page === 1 ? '' : `?p=${page}`}`, { allow404: true });
        if (res.status === 404) return;
        // Magento serves the last page again for any higher number: stop on repeats
        const offers = parseEplanetaPage(res.text, baseUrl).filter((o) => !seen.has(o.externalId));
        if (!offers.length) return;
        offers.forEach((o) => seen.add(o.externalId));
        yield { page, offers };
      }
    },
  };
}

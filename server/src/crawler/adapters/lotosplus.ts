import { parseRsd } from '../../lib/normalize.js';
import { ageFromText } from '../../lib/setnum.js';
import type { CrawlContext, PageResult, RawOffer, ShopAdapter } from '../types.js';

// Lotos Plus, a bookshop in Odžaci, runs on Shopify: the LEGO collection has a JSON feed
// (/collections/lego-kocke/products.json, 250 per page). Titles are Serbian names without the set
// number and the SKU is empty. The number is in the official description when it was copied in
// ("…LEGO® City Crveni dabldeker za razgledanje (60407) za uzraste…", about one in six products),
// and in every picture's file name ("lego-city-60407-02.webp", "lego-sonic-the-hedgehog-77118-01.webp").

interface ShopifyVariant {
  sku: string | null;
  price: string;
  compare_at_price: string | null;
  available: boolean;
}
export interface ShopifyCollectionProduct {
  id: number;
  title: string;
  handle: string;
  vendor?: string;
  body_html?: string | null;
  variants: ShopifyVariant[];
  images: { src: string }[];
}

const COLLECTION = 'lego-kocke';

/** "…/files/lego-city-60407-02.webp?v=1769958224" -> "60407" */
export function setNumFromLotosImage(src: string | null | undefined): string | null {
  const file = (src ?? '').split('?')[0].split('/').pop() ?? '';
  return file.match(/-(\d{5,6})(?:-\d{1,2})?\.\w+$/)?.[1] ?? null;
}

const text = (html: string | null | undefined) =>
  (html ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/** "LEGO Star Wars Separatistički MTT" -> ["Star", "Star Wars"]: the theme mapper picks the one it knows */
function themeWords(title: string): string[] {
  const words = title.replace(/^LEGO®?\s+/i, '').split(/\s+/);
  return words.length > 1 ? [words[0], `${words[0]} ${words[1]}`] : words;
}

export function parseLotosProducts(products: ShopifyCollectionProduct[], baseUrl: string): RawOffer[] {
  const out: RawOffer[] = [];
  for (const p of products) {
    const v = p.variants?.[0];
    if (!v || !p.title) continue;
    if (p.vendor !== 'LEGO' && !/\blego\b/i.test(p.title)) continue;
    const price = parseRsd(v.price);
    if (!price) continue;
    const body = text(p.body_html);
    const fromBody = body.match(/\((\d{5,6})\)/)?.[1] ?? null;
    const compare = parseRsd(v.compare_at_price);
    out.push({
      externalId: String(p.id),
      title: p.title.trim(),
      url: `${baseUrl}/products/${encodeURIComponent(p.handle)}`,
      imageUrl: p.images?.[0]?.src ?? null,
      priceRsd: price,
      regularPriceRsd: compare && compare > price ? compare : null,
      inStock: !!v.available,
      sku: fromBody,
      // the picture names come from the same source and have always matched so far (October 2026),
      // but a guess still has to agree with the title before it links
      skuGuess: fromBody ? null : setNumFromLotosImage(p.images?.[0]?.src),
      themeRaw: themeWords(p.title.trim()),
      ageMin: ageFromText(body),
    });
  }
  return out;
}

export function lotosplusAdapter(baseUrl = 'https://lotosplus.rs'): ShopAdapter {
  return {
    shop: { id: 'lotosplus', name: 'Lotos Plus', url: 'https://lotosplus.rs', kind: 'shop', membersOnly: true },
    async *crawl(ctx: CrawlContext): AsyncGenerator<PageResult> {
      for (let page = 1; page <= ctx.maxPages; page++) {
        const data = await ctx.http.getJson<{ products: ShopifyCollectionProduct[] }>(
          `${baseUrl}/collections/${COLLECTION}/products.json?limit=250&page=${page}`,
        );
        if (!data.products?.length) return;
        yield { page, offers: parseLotosProducts(data.products, baseUrl) };
        if (data.products.length < 250) return;
      }
    },
  };
}

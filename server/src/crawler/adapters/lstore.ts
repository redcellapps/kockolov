import { parseRsd } from '../../lib/normalize.js';
import { setNumFromSku } from '../../lib/setnum.js';
import type { CrawlContext, PageResult, RawOffer, ShopAdapter } from '../types.js';

// LEGO® Certified Store Srbija runs on Shopify, which publishes a JSON product feed.
// The SKU is the official LEGO set number; this shop is our reference (RRP) price.

interface ShopifyVariant {
  sku: string | null;
  price: string;
  compare_at_price: string | null;
  available: boolean;
}
interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  product_type: string;
  tags: string[];
  variants: ShopifyVariant[];
  images: { src: string }[];
}

export function parseLstoreProducts(products: ShopifyProduct[], baseUrl: string): RawOffer[] {
  const out: RawOffer[] = [];
  for (const p of products) {
    const v = p.variants?.[0];
    if (!v) continue;
    // free-gift clones and marketing items
    if (p.tags?.includes('bogos-gift') || p.handle.includes('freegift')) continue;
    if (p.product_type === 'Marketing') continue;
    const price = parseRsd(v.price);
    if (!price || price <= 1) continue; // "coming soon" items are priced 0
    const handleNum = p.handle.match(/-(\d{4,6})$/)?.[1] ?? null;
    const setNum = setNumFromSku(v.sku) ?? handleNum;
    if (!setNum) continue; // towels, bags, build-a-minifigure...
    const compare = parseRsd(v.compare_at_price);
    out.push({
      externalId: String(p.id),
      title: p.title.replace(/‍/g, '').trim(),
      url: `${baseUrl}/products/${p.handle}`,
      imageUrl: p.images?.[0]?.src ?? null,
      priceRsd: price,
      regularPriceRsd: compare && compare > price ? compare : null,
      inStock: !!v.available,
      sku: setNum,
      themeRaw: p.product_type ? [p.product_type] : [],
    });
  }
  return out;
}

export function lstoreAdapter(baseUrl: string): ShopAdapter {
  return {
    shop: { id: 'lstore', name: 'LEGO® Store Srbija', url: 'https://lstore.rs', kind: 'official' },
    async *crawl(ctx: CrawlContext): AsyncGenerator<PageResult> {
      for (let page = 1; page <= ctx.maxPages; page++) {
        const data = await ctx.http.getJson<{ products: ShopifyProduct[] }>(
          `${baseUrl}/products.json?limit=250&page=${page}`,
        );
        if (!data.products?.length) return;
        yield { page, offers: parseLstoreProducts(data.products, baseUrl) };
      }
    },
  };
}

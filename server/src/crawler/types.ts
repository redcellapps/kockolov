import type { PoliteFetcher } from '../lib/http.js';

export interface ShopInfo {
  id: string;
  name: string;
  url: string;
  kind: 'official' | 'shop' | 'marketplace';
  /**
   * Prices visible only to signed-in users. Since 19 Nov 2026 every shop is public (visitors and search
   * engines see all of them); kept so a shop could be made members-only again without new code.
   */
  membersOnly?: boolean;
}

/** What every adapter produces, regardless of how the shop exposes its data. */
export interface RawOffer {
  externalId: string;
  seller?: string;
  title: string;
  url: string;
  imageUrl?: string | null;
  priceRsd: number;
  regularPriceRsd?: number | null;
  /** the official shop's product text as plain paragraphs (LEGO Store only), for the set page */
  description?: string | null;
  /** number of pieces, when the shop says it */
  pieces?: number | null;
  inStock: boolean;
  stockQty?: number | null;
  /** set number if the shop states it explicitly (SKU) */
  sku?: string | null;
  /** set number read from a weaker source (an image file name); used only if the title doesn't contradict it */
  skuGuess?: string | null;
  themeRaw?: string[];
  ageMin?: number | null;
}

export interface CrawlContext {
  http: PoliteFetcher;
  log: (msg: string) => void;
  /** safety limit for pagination */
  maxPages: number;
}

export interface PageResult {
  offers: RawOffer[];
  page: number;
}

export interface ShopAdapter {
  shop: ShopInfo;
  /** Yields offers page by page; the pipeline handles storage. */
  crawl(ctx: CrawlContext): AsyncGenerator<PageResult>;
}

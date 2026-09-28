import * as cheerio from 'cheerio';
import { parseRsd } from '../../lib/normalize.js';
import type { CrawlContext, PageResult, RawOffer, ShopAdapter } from '../types.js';

// Kockarium is WooCommerce. We walk the "LEGO® kocke" category (sets only — the
// shop also sells clothing, bags and school supplies) page by page.
// Each card carries the SKU (= set number) on its add-to-cart button.

const CATEGORY_PATH = '/teme-lego/gwp-lego-setovi-kockica/';

function bestImage($img: cheerio.Cheerio<any>, $noscriptImg: cheerio.Cheerio<any>): string | null {
  const srcset =
    $noscriptImg.attr('srcset') || $img.attr('data-srcset-img') || $img.attr('data-srcset') || $img.attr('srcset') || '';
  if (srcset) {
    const cands = srcset
      .split(',')
      .map((s) => s.trim().split(/\s+/))
      .map(([url, w]) => ({ url, w: parseInt(w, 10) || 0 }))
      .filter((c) => c.url && !c.url.startsWith('data:'));
    // ~450px is plenty for cards and detail pages
    const good = cands.filter((c) => c.w >= 300).sort((a, b) => Math.abs(a.w - 450) - Math.abs(b.w - 450))[0];
    if (good) return good.url;
  }
  const candidates = [$img.attr('data-src-img'), $noscriptImg.attr('src'), $img.attr('data-src'), $img.attr('src')];
  return candidates.find((u) => u && !u.startsWith('data:')) ?? null;
}

export function parseKockariumPage(html: string): { offers: RawOffer[]; total: number | null } {
  const $ = cheerio.load(html);
  const offers: RawOffer[] = [];
  $('ul.products li.product').each((_, el) => {
    const $el = $(el);
    const cls = $el.attr('class') ?? '';
    const $btn = $el.find('[data-product_sku]').first();
    const sku = ($btn.attr('data-product_sku') ?? '').trim() || null;
    const id = $btn.attr('data-product_id') ?? cls.match(/\bpost-(\d+)\b/)?.[1];
    const $title = $el.find('.wc-loop-product-title a, .woocommerce-loop-product__title').first();
    const title = $title.text().trim();
    const url = $title.attr('href') || $el.find('a.woocommerce-LoopProduct-link').attr('href');
    if (!id || !title || !url) return;

    const $price = $el.find('.price').first();
    const insText = $price.find('ins').first().text();
    const delText = $price.find('del').first().text();
    const price = parseRsd(insText || $price.clone().children('del').remove().end().text());
    const regular = delText ? parseRsd(delText) : null;
    if (!price) return;

    const themeRaw = $el
      .find('.loop-product-categories a')
      .map((_, a) => $(a).text().trim())
      .get()
      .filter(Boolean);

    let ageMin: number | null = null;
    if (/\bproduct_(cat|tag)-odrasli\b/.test(cls)) ageMin = 18;

    const $img = $el.find('img').first();
    const $nsImg = cheerio.load($el.find('noscript').first().html() ?? '')('img').first();

    offers.push({
      externalId: String(id),
      title,
      url,
      imageUrl: bestImage($img, $nsImg),
      priceRsd: price,
      regularPriceRsd: regular && regular > price ? regular : null,
      inStock: !/\boutofstock\b/.test(cls),
      sku,
      themeRaw,
      ageMin,
    });
  });
  const countText = $('.woocommerce-result-count').first().text();
  const total = countText.match(/od\s+([\d.]+)\s+rezultat/)?.[1];
  return { offers, total: total ? parseInt(total.replace(/\./g, ''), 10) : null };
}

export function kockariumAdapter(baseUrl: string): ShopAdapter {
  return {
    shop: { id: 'kockarium', name: 'Kockarium', url: 'https://www.kockarium.rs', kind: 'shop' },
    async *crawl(ctx: CrawlContext): AsyncGenerator<PageResult> {
      let expected: number | null = null;
      let seen = 0;
      for (let page = 1; page <= ctx.maxPages; page++) {
        const url = page === 1 ? `${baseUrl}${CATEGORY_PATH}` : `${baseUrl}${CATEGORY_PATH}page/${page}/`;
        const res = await ctx.http.get(url, { allow404: true });
        if (res.status === 404) return; // past the last page
        const { offers, total } = parseKockariumPage(res.text);
        if (total !== null) expected = total;
        if (!offers.length) return;
        seen += offers.length;
        yield { page, offers };
        if (expected !== null && seen >= expected) return;
      }
    },
  };
}

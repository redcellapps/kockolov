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
  body_html?: string | null;
  product_type: string;
  tags: string[];
  variants: ShopifyVariant[];
  images: { src: string }[];
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', reg: '®', trade: '™', copy: '©' };
const decode = (t: string) =>
  t.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      // real characters only: no NUL or other control characters (Postgres refuses NUL), no surrogate
      // halves, nothing past U+10FFFF (String.fromCodePoint would throw and stop the whole crawl)
      return code >= 32 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) && !(code >= 0x7f && code < 0xa0) ? String.fromCodePoint(code) : ' ';
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });

/** Serbian rather than English: some products still carry LEGO's English text, which the site doesn't show. */
function looksSerbian(text: string): boolean {
  const sr = (text.match(/[čćžšđ]/gi)?.length ?? 0) + (text.match(/\b(je|i|za|sa|od|na|se|koji|koja|ovaj|ova)\b/gi)?.length ?? 0);
  const en = text.match(/\b(the|and|with|your|for|this|of|to)\b/gi)?.length ?? 0;
  return sr > en;
}

/**
 * The product text as plain paragraphs (one per line), or null for placeholders, app notices (free-gift
 * clones) and English texts. LEGO's Serbian copy: "Komplet sadrži 241 deo.", "za decu uzrasta 7+".
 */
export function lstoreDescription(html: string | null | undefined): string | null {
  if (!html || /bogos|mailto:/i.test(html)) return null;
  const text = decode(
    html
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<(script|style|template)\b[\s\S]*?<\/\1\s*>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|li|h[1-6]|div|ul|ol)>/gi, '\n')
      .replace(/<li[^>]*>/gi, '• ')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/g, ' ')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l && l !== '...' && l !== '•')
    .join('\n');
  if (text.length < 80 || !looksSerbian(text)) return null;
  return text.length > 4000 ? `${text.slice(0, 3999).replace(/\s+\S*$/, '')}…` : text;
}

// a piece count: "850", "1.234", "1 234"; LEGO's Serbian copy says delova / dela / deo / elemenata
const NUM = String.raw`(?<![\d.,])(\d{1,2}(?:[. \u00a0]\d{3})+|\d{1,5})`;
const UNIT = String.raw`\s*(?:delova|dela|deo|elemenata|elementa|kockica)(?![a-zčćžšđ])`;
const SAID = new RegExp(String.raw`(?:sadrži|sadrzi|ukupno|\bima\b|čini ga|izgrađen od)[^\d]{0,40}?${NUM}${UNIT}`, 'i');
const ANY = new RegExp(`${NUM}${UNIT}`, 'gi');
const count = (s: string) => Number(s.replace(/[. \u00a0]/g, ''));
const plausible = (n: number) => Number.isFinite(n) && n > 0 && n < 20000;

/**
 * The piece count from the product text: "Komplet sadrži 850 delova." first; otherwise the largest count
 * mentioned (so "2 mini-figure ... 850 delova" gives 850, not 2).
 */
export function piecesFrom(text: string | null): number | null {
  if (!text) return null;
  const said = SAID.exec(text);
  if (said && plausible(count(said[1]))) return count(said[1]);
  const all = [...text.matchAll(ANY)].map((m) => count(m[1])).filter(plausible);
  return all.length ? Math.max(...all) : null;
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
    const description = lstoreDescription(p.body_html);
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
      description,
      pieces: piecesFrom(description),
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

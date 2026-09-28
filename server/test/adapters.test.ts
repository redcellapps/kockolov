import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractAnanasResults, hitToOffer } from '../src/crawler/adapters/ananas.js';
import { parseKockariumPage } from '../src/crawler/adapters/kockarium.js';
import { parseLstoreProducts } from '../src/crawler/adapters/lstore.js';

const fx = (p: string) => readFileSync(path.join(__dirname, 'fixtures', p), 'utf8');

describe('LEGO Store (Shopify JSON)', () => {
  const offers = parseLstoreProducts(JSON.parse(fx('lstore/products-page1.json')).products, 'https://lstore.rs');
  it('skips gifts, unpriced "coming soon" items and non-sets', () => {
    const skus = offers.map((o) => o.sku);
    expect(skus).not.toContain('40900'); // free gift clone
    expect(skus).not.toContain('75457'); // price 0.00
    expect(offers.find((o) => o.title === 'LEGO peškir')).toBeUndefined();
    expect(offers).toHaveLength(8);
  });
  it('maps price, stock, theme and url', () => {
    const hp = offers.find((o) => o.sku === '76476')!;
    expect(hp).toMatchObject({
      priceRsd: 51999,
      inStock: true,
      url: 'https://lstore.rs/products/lego-harry-potter-76476',
      themeRaw: ['LEGO® Harry Potter™'],
    });
    expect(offers.find((o) => o.sku === '11383')!.inStock).toBe(false);
    expect(offers.find((o) => o.sku === '10280')!.regularPriceRsd).toBe(9999);
  });
});

describe('Kockarium (WooCommerce HTML)', () => {
  const { offers, total } = parseKockariumPage(fx('kockarium/page1.html'));
  it('reads the total count and all cards', () => {
    expect(total).toBe(4);
    expect(offers).toHaveLength(2);
  });
  it('parses a regular card', () => {
    expect(offers[0]).toMatchObject({
      externalId: '541874',
      sku: '11383',
      title: '11383 Gradonačelnikova rezidencija',
      url: 'https://www.kockarium.rs/lego/11383-gradonacelnikova-rezidencija/',
      priceRsd: 13190,
      regularPriceRsd: null,
      inStock: true,
      ageMin: 18,
    });
    expect(offers[0].themeRaw).toEqual(['LEGO® Icons', 'LEGO® kocke', 'LEGO® modeli za odrasle']);
    expect(offers[0].imageUrl).toMatch(/11383_Box1_v29-450x450\.jpg$/);
    expect(offers[1].imageUrl).toMatch(/11378_Box1_v29-254x254\.jpg\.webp$/); // no srcset -> plain src
  });
  it('parses a sale card (del/ins)', () => {
    expect(offers[1]).toMatchObject({ sku: '11378', priceRsd: 21112, regularPriceRsd: 26390 });
  });
  it('detects out-of-stock cards', () => {
    const p2 = parseKockariumPage(fx('kockarium/page2.html')).offers;
    expect(p2.find((o) => o.sku === '21275')!.inStock).toBe(false);
    expect(p2.find((o) => o.sku === '71053-X')).toBeDefined();
  });
});

describe('Ananas (embedded search results)', () => {
  const r = extractAnanasResults(fx('ananas/page1.html'))!;
  it('extracts the results block', () => {
    expect(r.nbPages).toBe(2);
    expect(r.hits).toHaveLength(4);
  });
  it('maps hits to offers per seller', () => {
    const sale = hitToOffer(r.hits[0], 'https://ananas.rs')!;
    expect(sale).toMatchObject({
      externalId: '384929',
      seller: 'Spark',
      priceRsd: 7319,
      regularPriceRsd: 8500,
      inStock: true,
      stockQty: 10,
      ageMin: 18,
      url: 'https://ananas.rs/proizvod/lego-botanicals-creator-expert-buket-cveca-10280-uzrast-18/384929',
      imageUrl: 'https://static.ananas.rs/assets/Product_Images/13_10_2025/82fdb87c35d6f659.jpeg',
    });
    const oos = hitToOffer(r.hits[1], 'https://ananas.rs')!;
    expect(oos.inStock).toBe(false);
    const bigbang = hitToOffer(r.hits[3], 'https://ananas.rs')!;
    expect(bigbang.seller).toBe('BIG BANG by BC Group');
  });
  it('returns null when the page layout changes', () => {
    expect(extractAnanasResults('<html><body>nothing</body></html>')).toBeNull();
  });
});

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseBigbangPage } from '../src/crawler/adapters/bigbang.js';
import { parseEkupiPage } from '../src/crawler/adapters/ekupi.js';
import { parseEplanetaPage } from '../src/crawler/adapters/eplaneta.js';
import { allAdapters } from '../src/crawler/adapters/index.js';
import { kliklakAdapter, parseKliklakPage } from '../src/crawler/adapters/kliklak.js';
import { parseKockaPage } from '../src/crawler/adapters/kocka.js';
import { kockalendAdapter, dexyAdapter, parseNbshopPage } from '../src/crawler/adapters/nbshop.js';
import { parseOddoPage } from '../src/crawler/adapters/oddo.js';
import { parsePertiniPage, setNumFromPertiniImage } from '../src/crawler/adapters/pertini.js';
import { parseShoppsterPage, shoppsterAdapter, shoppsterRetry } from '../src/crawler/adapters/shoppster.js';
import { parseTehnomanija, setNumFromTehnomanijaName } from '../src/crawler/adapters/tehnomanija.js';
import { setNumFromImage, wooProductToOffer, wooStoreAdapter } from '../src/crawler/adapters/woocommerce.js';
import { matchOffer } from '../src/crawler/matching.js';
import type { CrawlContext, PageResult, RawOffer } from '../src/crawler/types.js';
import type { PoliteFetcher } from '../src/lib/http.js';

const fx = (p: string) => readFileSync(path.join(__dirname, 'fixtures', p), 'utf8');
const byId = (offers: RawOffer[], id: string) => offers.find((o) => o.externalId === id)!;
const idx = { known: new Set(['10329', '42238', '71048', '40567', '10696']), names: new Map<string, string>() };

/** A crawl context whose fetcher serves pages from a map (missing URL = 404). */
function fakeCtx(pages: Record<string, string>) {
  const asked: string[] = [];
  const http = {
    async get(url: string) {
      asked.push(url);
      return url in pages ? { status: 200, text: pages[url] } : { status: 404, text: '' };
    },
  } as unknown as PoliteFetcher;
  const ctx: CrawlContext = { http, log: () => {}, maxPages: 50 };
  return { ctx, asked };
}
async function collect(gen: AsyncGenerator<PageResult>) {
  const out: PageResult[] = [];
  for await (const p of gen) out.push(p);
  return out;
}

describe('every new shop is members-only', () => {
  it('marks all shops except the original three', () => {
    const shops = allAdapters().map((a) => a.shop);
    expect(shops.filter((s) => !s.membersOnly).map((s) => s.id)).toEqual(['lstore', 'kockarium', 'ananas']);
    expect(shops.filter((s) => s.membersOnly)).toHaveLength(14);
    expect(new Set(shops.map((s) => s.id)).size).toBe(shops.length);
  });
});

describe('NBSHOP (Dexy, Kockalend, Baby Park)', () => {
  const offers = parseNbshopPage(fx('dexy/page1.html'), 'https://www.dexy.co.rs');
  it('reads the data attributes, once per product', () => {
    expect(offers).toHaveLength(3);
    expect(byId(offers, '11199140')).toMatchObject({
      title: 'LEGO TECHNIC NEOM MCLAREN EXTREME E',
      sku: '42166',
      priceRsd: 8999,
      regularPriceRsd: 10999,
      inStock: true,
      url: 'https://www.dexy.co.rs/lego-technic/11199140-lego-technic-neom-mclaren-extreme-e',
      themeRaw: ['Technic'],
    });
    expect(byId(offers, '11203457')).toMatchObject({ priceRsd: 199, regularPriceRsd: null, themeRaw: ['Marvel Super Hero'] });
    expect(byId(offers, '11182695').imageUrl).toBeNull(); // placeholder image
  });
  it('keeps only LEGO products (code "LE…"), not recommended items from other categories', () => {
    const bp = parseNbshopPage(fx('babypark/page1.html'), 'https://www.babypark.rs');
    expect(bp.map((o) => o.sku)).toEqual(['10457']);
  });
  it('rounds prices with decimals (Kockalend: "3.484,15")', () => {
    const [o] = parseNbshopPage(fx('kockalend/page1.html'), 'https://www.kockalend.rs');
    expect(o).toMatchObject({ priceRsd: 3484, regularPriceRsd: 4099, sku: '60495' });
  });
  it('finds the second page whichever way the shop numbers it', async () => {
    const kl = 'https://www.kockalend.rs';
    // Kockalend: /page-1 repeats the first page, /page-2 is the second
    const k = fakeCtx({
      [`${kl}/lego-kocke`]: fx('kockalend/page1.html'),
      [`${kl}/lego-kocke/page-1`]: fx('kockalend/page1.html'),
      [`${kl}/lego-kocke/page-2`]: fx('kockalend/page2.html'),
    });
    const kp = await collect(kockalendAdapter(kl).crawl(k.ctx));
    expect(kp.map((p) => [p.page, p.offers.map((o) => o.sku)])).toEqual([
      [1, ['60495']],
      [2, ['42621']],
    ]);
    // Dexy: /page-1 is the second page; stops at the first 404
    const dx = 'https://www.dexy.co.rs';
    const d = fakeCtx({ [`${dx}/lego-kocke`]: fx('dexy/page1.html'), [`${dx}/lego-kocke/page-1`]: fx('kockalend/page2.html') });
    const dp = await collect(dexyAdapter(dx).crawl(d.ctx));
    expect(dp).toHaveLength(2);
    expect(d.asked.at(-1)).toBe(`${dx}/lego-kocke/page-2`);
  });
});

describe('BigBang', () => {
  const offers = parseBigbangPage(fx('bigbang/page1.html'), 'https://www.bigbang.rs');
  it('reads the listing, not the recommendation carousel', () => {
    expect(offers.map((o) => o.externalId)).toEqual(['366310', '305943', '257793']);
  });
  it('takes the regular price, not the club ("VIP") price', () => {
    expect(byId(offers, '305943')).toMatchObject({ priceRsd: 8299, title: 'LEGO 43279 VOLI i IV', ageMin: 9 });
    expect(byId(offers, '366310')).toMatchObject({
      priceRsd: 10749,
      ageMin: 16,
      url: 'https://www.bigbang.rs/lego-43024-ayrton-senna-kaciga-366310',
      imageUrl: 'https://www.bigbang.rs/upload/s/366310-lego-43024-ayrton-senna-kaciga.jpg',
    });
  });
  it('marks unavailable products', () => {
    expect(byId(offers, '257793').inStock).toBe(false);
    expect(byId(offers, '366310').inStock).toBe(true);
  });
});

describe('eKupi', () => {
  const offers = parseEkupiPage(fx('ekupi/page1.html'), 'https://www.ekupi.rs');
  it('reads price, old price, theme and age', () => {
    expect(offers).toHaveLength(3);
    expect(byId(offers, 'EK000709526')).toMatchObject({
      title: 'LEGO Pilijev i Sparkplagov kamp 77075',
      priceRsd: 2099,
      regularPriceRsd: 2219,
      themeRaw: ['Fortnite'],
      ageMin: 7,
      inStock: true,
    });
    expect(byId(offers, 'EK000709526').url).toMatch(/^https:\/\/www\.ekupi\.rs\/rs\/.+\/p\/EK000709526$/);
    expect(byId(offers, 'EK000809085').regularPriceRsd).toBeNull();
  });
  it('matches by the number in the title', () => {
    expect(matchOffer(byId(offers, 'EK000839396'), idx)).toEqual({ setNum: '76330', method: 'title' });
  });
});

describe('Kocka.rs', () => {
  const offers = parseKockaPage(fx('kocka/page1.html'), 'https://kocka.rs');
  it('reads the product code as the set number', () => {
    expect(byId(offers, '4826')).toMatchObject({
      sku: '71048',
      priceRsd: 500,
      title: '71048: LEGO Minifigures – Series 27',
      inStock: true,
      url: 'https://kocka.rs/proizvod/4826/71048-lego-minifigures-series-27',
    });
    expect(byId(offers, '4826').imageUrl).toContain('/storage/products/thumb/4826-71048-0-list_jpg.jpg');
  });
  it('handles sold-out cards and odd codes', () => {
    const o = byId(offers, '3120');
    expect(o).toMatchObject({ inStock: false, sku: null, priceRsd: 1900 });
    expect(matchOffer(o, idx)).toEqual({ setNum: '40567', method: 'title' });
  });
});

describe('Pertini Toys', () => {
  const offers = parsePertiniPage(fx('pertini/page1.html'), 'https://www.pertinitoys.com');
  it('takes the set number from the image name', () => {
    expect(offers.map((o) => o.sku)).toEqual(['42238', '77006', null]);
    expect(byId(offers, 'lego-technic-ducati-desmo450-mx-factory-oqo')).toMatchObject({
      title: 'LEGO TECHNIC Ducati Desmo450 MX Factory',
      priceRsd: 6999,
      url: 'https://www.pertinitoys.com/product--lego-technic-ducati-desmo450-mx-factory-oqo',
    });
    expect(setNumFromPertiniImage('/fajlovi/product/lego-ideas-21348-box1-v29_69baacd9f3710.jpg?size=md')).toBe('21348');
    expect(setNumFromPertiniImage('/fajlovi/product/kocke-sa-12345abc_69baacd9f3710.jpg')).toBeNull();
  });
});

describe('Shoppster (Angular transfer state)', () => {
  const base = 'https://www.shoppster.rs';
  const { offers, totalPages } = parseShoppsterPage(fx('shoppster/page1.html'), base);
  it('reads the embedded search result and the page count', () => {
    expect(totalPages).toBe(28);
    expect(offers).toHaveLength(3);
  });
  it('maps promo price, seller, stock and theme', () => {
    expect(byId(offers, '4370822')).toMatchObject({
      title: 'LEGO Sićušne biljke 10329',
      seller: 'Kockarium doo',
      priceRsd: 5272,
      regularPriceRsd: 6590,
      inStock: true,
      stockQty: 2,
      url: `${base}/p/4370822`,
      themeRaw: ['Lego za odrasle'],
    });
    expect(byId(offers, '4370822').imageUrl).toMatch(/^https:\/\/www\.shoppster\.rs\/medias\/.+\?context=/);
    expect(byId(offers, '0007442')).toMatchObject({ priceRsd: 10990, regularPriceRsd: null }); // keeps leading zeros
    expect(byId(offers, '6941230').inStock).toBe(false);
  });
  it('also reads the escaped state of older Angular versions', () => {
    expect(parseShoppsterPage(fx('shoppster/page1-escaped.html'), base).offers).toEqual(offers);
  });
  it('returns nothing for a page without the state', () => {
    expect(parseShoppsterPage('<html><body>Održavanje</body></html>', base)).toEqual({ offers: [], totalPages: 0, found: false });
  });
  it('asks again for a page that came without data, and fails the run if it never gets any', async () => {
    shoppsterRetry.pauseMs = 0;
    const shell = '<html><body><app-root></app-root></body></html>';
    const asked: string[] = [];
    const serve = (answers: string[]) => {
      const http = {
        get: async (url: string) => {
          asked.push(url);
          return { status: 200, text: answers.shift() ?? shell };
        },
      } as unknown as PoliteFetcher;
      return { http, log: () => {}, maxPages: 1 } satisfies CrawlContext;
    };
    const got: PageResult[] = [];
    for await (const p of shoppsterAdapter(base).crawl(serve([shell, fx('shoppster/page1.html')]))) got.push(p);
    expect(got.map((p) => p.offers.length)).toEqual([3]);
    // a stable order: the default one repeats and skips products between pages
    expect(asked).toEqual([`${base}/c/F1412?sortCode=name-asc`, `${base}/c/F1412?sortCode=name-asc`]);
    const never = async () => {
      for await (const _ of shoppsterAdapter(base).crawl(serve([]))) void _;
    };
    await expect(never()).rejects.toThrow(/bez podataka/);
  });
});

describe('WooCommerce Store API (Toyzzz, ABC Kocka)', () => {
  it('converts minor units and prefers the image number when the SKU is wrong', () => {
    const items = JSON.parse(fx('toyzzz/products-search-lego-p1.json'));
    const park = wooProductToOffer(items.find((p: { id: number }) => p.id === 48478))!;
    expect(park).toMatchObject({ sku: '41737', priceRsd: 8640, regularPriceRsd: 9600, inStock: true });
    const dodge = wooProductToOffer(items.find((p: { id: number }) => p.id === 37703))!;
    expect(dodge).toMatchObject({ sku: '77237', title: 'Lego speed dodge auto', url: 'https://toyzzz.rs/igracke/ucimo-zajedno/kocke/lego-speed-dodge-auto' });
    expect(setNumFromImage('https://toyzzz.rs/wp-content/uploads/2024/12/LE31146.jpg')).toBe('31146');
    expect(setNumFromImage('https://x/5702016914177-1.jpg')).toBeNull(); // an EAN is not a set number
  });
  it('reads ABC Kocka: sets, single minifigures and unavailable items', () => {
    const [set, fig, off] = (JSON.parse(fx('abckocka/products-p1.json')) as Parameters<typeof wooProductToOffer>[0][]).map(
      (p) => wooProductToOffer(p)!,
    );
    expect(set).toMatchObject({ sku: '77264', priceRsd: 6490, regularPriceRsd: null, ageMin: 9, stockQty: 1 });
    expect(set.themeRaw).toContain('LEGO® Speed Champions');
    expect(fig.title).toBe('LEGO® Star Wars sw0360 Battle Droid Pilot – Blue Torso with Tan Insignia');
    expect(fig.sku).toBe('sw0360');
    expect(matchOffer(fig, idx)).toBeNull(); // a minifigure is not set "0360"
    expect(off).toMatchObject({ inStock: false, priceRsd: 3990, regularPriceRsd: 4590, themeRaw: ['LEGO® Technic™'] });
  });
  it('walks every listing, merges by id and filters with keep()', async () => {
    const b = 'https://shop.test';
    const items = JSON.parse(fx('toyzzz/products-search-lego-p1.json'));
    const { ctx, asked } = fakeCtx({
      [`${b}/wp-json/wc/store/v1/products?tag=530&per_page=100&page=1`]: JSON.stringify([items[1]]),
      [`${b}/wp-json/wc/store/v1/products?search=lego&per_page=100&page=1`]: JSON.stringify([...items, { ...items[0], id: 1, name: 'Kutija za igračke' }]),
    });
    const a = wooStoreAdapter({ id: 't', name: 'T', url: b, kind: 'shop' }, b, ['tag=530', 'search=lego'], (p) => /lego/i.test(p.name));
    const pages = await collect(a.crawl(ctx));
    expect(pages.flatMap((p) => p.offers.map((o) => o.externalId))).toEqual(['37703', '48478']);
    expect(asked).toHaveLength(2); // short pages: no need to ask for page 2
  });
});

describe('Tehnomanija (Magento GraphQL)', () => {
  const offers = parseTehnomanija(JSON.parse(fx('tehnomanija/graphql-lego.json')), 'https://www.tehnomanija.rs');
  it('maps special price, regular price, url and the set number from the name', () => {
    expect(offers.map((o) => o.sku)).toEqual(['43012', '21587', '42212', '42213']);
    expect(offers[0]).toMatchObject({
      externalId: '1265890',
      priceRsd: 3699,
      regularPriceRsd: 4352,
      inStock: true,
      url: 'https://www.tehnomanija.rs/lego-kristijano-ronaldo-fudbalski-najbolji-trenuci-le43012-1265890',
    });
    expect(offers[1].title).toBe('LEGO Minecraft Zombi tamnica LE21587');
    expect(setNumFromTehnomanijaName('LEGO Automobil Ford Bronco SUVLE42213')).toBe('42213');
  });
  it('fails loudly on a GraphQL error', () => {
    expect(() => parseTehnomanija({ errors: [{ message: 'Internal server error' }] }, 'x')).toThrow(/Internal server error/);
  });
});

describe('ePlaneta (JSON-LD)', () => {
  const offers = parseEplanetaPage(fx('eplaneta/page1.html'), 'https://eplaneta.rs');
  it('reads the ItemList and old prices from the cards', () => {
    expect(offers.map((o) => o.externalId)).toEqual(['84144', '272184', 'ep3092710']); // marketplace items: "ep…"
    expect(byId(offers, '272184')).toMatchObject({ priceRsd: 1800, regularPriceRsd: 1850, inStock: true });
    expect(byId(offers, '84144')).toMatchObject({
      title: 'LEGO 10914 Deluks kutija kocki',
      priceRsd: 7199,
      regularPriceRsd: null,
      url: 'https://eplaneta.rs/lego-duplo-10914-deluks-kutija-kocki-84144.html',
    });
    expect(byId(offers, '84144').imageUrl).toMatch(/^https:\/\/eplaneta\.rs\/media\/catalog\/product\//);
  });
  it('has nothing past the last page', () => {
    expect(parseEplanetaPage(fx('eplaneta/page-past-end.html'), 'https://eplaneta.rs')).toEqual([]);
  });
});

describe('ODDO igračke', () => {
  const offers = parseOddoPage(fx('oddo/page1.html'), 'https://www.oddoigracke.rs');
  it('takes the ODDO price, the regular price and the set number', () => {
    expect(byId(offers, '174295')).toMatchObject({
      title: 'Lego Lego Classic Gray Baseplate LE11024',
      sku: '11024',
      priceRsd: 1899,
      regularPriceRsd: 1999,
      inStock: true,
      url: 'https://www.oddoigracke.rs/lego-lego-classic-gray-baseplate-le11024',
      imageUrl: 'https://www.oddoigracke.rs/proizvodi/174295/lego-lego-classic-gray-baseplate-le11024.jpg',
    });
  });
  it('reads the number from the link and marks products without "Kupi" as unavailable', () => {
    const o = offers.find((x) => x.title.startsWith('LEGO MARVEL'))!;
    expect(o).toMatchObject({ sku: '76319', inStock: false });
  });
});

describe('Kliklak', () => {
  const offers = parseKliklakPage(fx('kliklak/page1.html'), 'https://www.kliklak.rs');
  it('keeps LEGO products and reads both prices', () => {
    expect(offers.map((o) => o.externalId)).toEqual(['806059', '615592']);
    expect(byId(offers, '615592')).toMatchObject({ priceRsd: 6699, regularPriceRsd: 8499, inStock: true });
    expect(byId(offers, '806059').imageUrl).toBe(
      'https://c.cdnmp.net/241860914/p/t/8/lego-srednja-kofica-kreativnih-kockica-10696~806059.jpg',
    );
    expect(matchOffer(byId(offers, '615592'), idx)).toEqual({ setNum: '10698', method: 'title' });
  });
  it('waits longer for its slow listing pages', async () => {
    const base = 'https://www.kliklak.rs';
    const calls: { url: string; opts: { timeoutMs?: number } }[] = [];
    const http = {
      async get(url: string, opts: { timeoutMs?: number } = {}) {
        calls.push({ url, opts });
        return url === `${base}/lego` ? { status: 200, text: fx('kliklak/page1.html') } : { status: 404, text: '' };
      },
    } as unknown as PoliteFetcher;
    const pages = await collect(kliklakAdapter(base).crawl({ http, log: () => {}, maxPages: 5 }));
    expect(pages.map((p) => p.offers.length)).toEqual([2]);
    expect(calls.map((c) => c.url)).toEqual([`${base}/lego`, `${base}/lego/p2`]);
    expect(calls.every((c) => c.opts.timeoutMs === 120_000)).toBe(true);
  });
});

describe('set names from members-only shops', () => {
  it('drops numbers, shop codes and brand, and fixes ALL CAPS', async () => {
    const { tidyName } = await import('../src/crawler/refresh.js');
    expect(tidyName('LEGO TECHNIC NEOM MCLAREN EXTREME E', '42166')).toBe('Technic Neom Mclaren Extreme E');
    expect(tidyName('71048: LEGO Minifigures – Series 27', '71048')).toBe('Minifigures – Series 27');
    expect(tidyName('LEGO Minecraft Zombi tamnica LE21587', '21587')).toBe('Minecraft Zombi tamnica');
    expect(tidyName('Lego classic creative large creative box ( LE10698 )', '10698')).toBe('Classic creative large creative box');
  });
});

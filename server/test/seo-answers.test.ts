import { afterEach, describe, expect, it, vi } from 'vitest';
import { config } from '../src/config.js';
import { catalogSet } from '../src/lib/legoCatalog.js';
import { submitIndexNow } from '../src/seo/indexnow.js';
import { summaryText } from '../src/seo/pages.js';

describe('a list in sentences', () => {
  it('counts, gives the range and the cheapest set, in proper Serbian', () => {
    expect(summaryText(null)).toMatch(/^Trenutno nijedan set/);
    expect(summaryText({ total: 1, min_price: 1999, max_price: 1999, on_sale: 0, cheapest: { set_num: '1', name: 'A', price: 1999 } })).toBe(
      'Na stanju je 1 set, po ceni od 1.999 RSD.',
    );
    expect(summaryText({ total: 3, min_price: 999, max_price: 4999, on_sale: 1, cheapest: { set_num: '30001', name: 'Mali set', price: 999 } })).toBe(
      'Na stanju su 3 seta, od 999 RSD do 4.999 RSD. Najjeftiniji je Mali set (30001) za 999 RSD. Jedan je na akciji.',
    );
    expect(summaryText({ total: 25, min_price: 499, max_price: 9999, on_sale: 21, cheapest: { set_num: '2', name: 'B', price: 499 } })).toMatch(
      /^Na stanju je 25 setova, .* Na akciji je 21 set\.$/,
    );
  });
});

describe('the catalog of every LEGO set', () => {
  it('knows sets no shop sells', () => {
    expect(catalogSet('40772')).toMatchObject({ name: 'Celebration Series: Luminous Ghost', year: 2025, pieces: 167 });
    expect(catalogSet('00000')).toBeNull();
  });
});

describe('IndexNow', () => {
  const saved = { key: config.INDEXNOW_KEY, pub: config.PUBLIC_MODE, url: config.APP_URL };
  afterEach(() => {
    Object.assign(config, { INDEXNOW_KEY: saved.key, PUBLIC_MODE: saved.pub, APP_URL: saved.url });
    vi.unstubAllGlobals();
  });

  it('tells Bing which pages changed, with the key file as proof', async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return new Response('', { status: 202 });
    });
    Object.assign(config, { INDEXNOW_KEY: 'abc123def456', PUBLIC_MODE: false, APP_URL: 'https://kockolov.rs/' });
    expect(await submitIndexNow(['/set/1'], () => {})).toBe(0); // a private site reports nothing
    config.PUBLIC_MODE = true;
    expect(await submitIndexNow(['/set/1', '/set/1', '/ponude'], () => {})).toBe(2);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.indexnow.org/indexnow');
    expect(calls[0].body).toEqual({
      host: 'kockolov.rs',
      key: 'abc123def456',
      keyLocation: 'https://kockolov.rs/abc123def456.txt',
      urlList: ['https://kockolov.rs/set/1', 'https://kockolov.rs/ponude'],
    });
  });

  it('says so when Bing refuses', async () => {
    vi.stubGlobal('fetch', async () => new Response('bad key', { status: 403 }));
    Object.assign(config, { INDEXNOW_KEY: 'abc123def456', PUBLIC_MODE: true });
    await expect(submitIndexNow(['/'], () => {})).rejects.toThrow(/403/);
  });
});

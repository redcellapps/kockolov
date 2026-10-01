import { readFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from '../src/config.js';
import { startMockShops } from './mockShops.js';

const dbUrl = process.env.DATABASE_URL!;
const dbAvailable = await (async () => {
  const c = new pg.Client({ connectionString: dbUrl, connectionTimeoutMillis: 1500 });
  try {
    await c.connect();
    await c.end();
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!dbAvailable)('crawl → database → API (end to end, recorded shop pages)', async () => {
  const { pool, migrate, query, one } = await import('../src/db.js');
  const { runCrawl } = await import('../src/crawler/pipeline.js');
  const { buildApp } = await import('../src/api/app.js');
  const { hashPassword } = await import('../src/api/auth.js');
  let mock: Awaited<ReturnType<typeof startMockShops>>;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let cookie = '';
  const log = () => {};

  beforeAll(async () => {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migrate(log);
    mock = await startMockShops();
    config.LSTORE_BASE_URL = mock.base;
    config.KOCKARIUM_BASE_URL = mock.base;
    config.ANANAS_BASE_URL = mock.base;
    app = await buildApp({ logger: false });
  });

  afterAll(async () => {
    await app?.close();
    await mock?.close();
    await pool.end();
  });

  it('crawls all three shops', async () => {
    const res = await runCrawl({ log });
    const by = Object.fromEntries(res.map((r) => [r.shop, r]));
    expect(by.lstore).toMatchObject({ status: 'ok', items: 8, matched: 8 });
    expect(by.kockarium).toMatchObject({ status: 'ok', items: 4, pages: 2 });
    expect(by.ananas.status).toBe('ok');
    expect(by.ananas.items).toBe(7); // 8 hits across pages, one duplicate from paging drift
    // polite: robots.txt was consulted
    expect(mock.hits).toContain('/robots.txt');
  });

  it('links offers from different shops to one set', async () => {
    const offers = await query('SELECT shop_id, seller, price_rsd FROM offers WHERE set_num = $1 ORDER BY price_rsd', ['10280']);
    expect(offers).toEqual([
      { shop_id: 'ananas', seller: 'Spark', price_rsd: 7319 },
      { shop_id: 'lstore', seller: '', price_rsd: 8999 },
    ]);
    const monet = await one('SELECT set_num, match_method FROM offers WHERE external_id = $1', ['9000001']);
    expect(monet).toEqual({ set_num: '31999', match_method: 'name' });
    const box = await one('SELECT set_num FROM offers WHERE external_id = $1', ['5477491']);
    expect(box!.set_num).toBeNull(); // storage box is not a set
  });

  it('derives names, themes and reference prices', async () => {
    const s = await query('SELECT set_num, name, theme_slug, rrp_rsd FROM sets ORDER BY set_num');
    const get = (n: string) => s.find((r) => r.set_num === n);
    expect(get('11383')).toMatchObject({ name: 'Gradonačelnikova rezidencija', theme_slug: 'icons', rrp_rsd: 13999 });
    expect(get('76355')!.theme_slug).toBe('dc');
    expect(get('76327')!.theme_slug).toBe('marvel');
    expect(get('76476')!.theme_slug).toBe('harry-potter');
    expect(get('21267')).toMatchObject({ name: 'Minecraft Iladžerska pustinjska patrola', theme_slug: 'minecraft', rrp_rsd: null });
  });

  it('computes today\'s best buys', async () => {
    const deals = await query('SELECT set_num, rank, reasons FROM deals ORDER BY rank');
    const nums = deals.map((d) => d.set_num);
    expect(nums).toEqual(expect.arrayContaining(['10280', '11378', '31999']));
    expect(nums).not.toContain('11383'); // only 6% under an out-of-stock reference
  });

  it('requires login while the site is private', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/sets' });
    expect(r.statusCode).toBe(401);
    await query("INSERT INTO users (email, name, role, password_hash, accepted_at) VALUES ('milan@example.com', 'Milan', 'admin', $1, now())", [
      await hashPassword('tajna-lozinka'),
    ]);
    const bad = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'milan@example.com', password: 'x' } });
    expect(bad.statusCode).toBe(401);
    const ok = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'Milan@Example.com', password: 'tajna-lozinka' },
    });
    expect(ok.statusCode).toBe(200);
    cookie = String(ok.headers['set-cookie']).split(';')[0];
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.json().user).toMatchObject({ email: 'milan@example.com', role: 'admin' });
  });

  it('searches in Serbian (Latin + Cyrillic, with or without diacritics) and English theme names', async () => {
    for (const q of ['hari poter', 'Хари Потер', 'harry potter', 'ministarstvo']) {
      const r = await app.inject({ method: 'GET', url: `/api/sets?q=${encodeURIComponent(q)}`, headers: { cookie } });
      expect(r.json().items.map((i: { set_num: string }) => i.set_num), q).toContain('76476');
    }
    const byNum = await app.inject({ method: 'GET', url: '/api/sets?q=11383&stock=0', headers: { cookie } });
    expect(byNum.json().items[0].set_num).toBe('11383');
    const gradon = await app.inject({ method: 'GET', url: '/api/sets?q=gradonacelnikova', headers: { cookie } });
    expect(gradon.json().items[0]).toMatchObject({ set_num: '11383', best_price: 13190, best_shop: 'kockarium' });
  });

  it('filters by theme, shop, price and sale', async () => {
    const theme = await app.inject({ method: 'GET', url: '/api/sets?theme=botanicals', headers: { cookie } });
    expect(theme.json().items.map((i: { set_num: string }) => i.set_num).sort()).toEqual(['10280', '10343']);
    const facets = theme.json().facets;
    expect(facets.themes.find((t: { slug: string }) => t.slug === 'icons')).toBeDefined(); // facet ignores own filter
    const shop = await app.inject({ method: 'GET', url: '/api/sets?shop=kockarium', headers: { cookie } });
    expect(shop.json().items.every((i: { shops: string[] }) => i.shops.includes('kockarium'))).toBe(true);
    const price = await app.inject({ method: 'GET', url: '/api/sets?min=20000&sort=price_asc', headers: { cookie } });
    expect(price.json().items.map((i: { best_price: number }) => i.best_price)).toEqual([21112, 24999, 51999]);
    const sale = await app.inject({ method: 'GET', url: '/api/sets?sale=1', headers: { cookie } });
    expect(sale.json().items.map((i: { set_num: string }) => i.set_num)).toEqual(expect.arrayContaining(['11378', '10280']));
  });

  it('returns a set page with all offers and history', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/sets/10280', headers: { cookie } });
    const body = r.json();
    expect(body.set).toMatchObject({ set_num: '10280', name: 'Buket cveća', theme_name: 'Botanicals', rrp_rsd: 8999 });
    expect(body.offers.map((o: { shop_id: string }) => o.shop_id)).toEqual(['ananas', 'lstore']);
    expect(body.history.length).toBe(2);
    expect(body.deal.reasons[0]).toMatchObject({ type: 'vs_rrp' });
    const deals = await app.inject({ method: 'GET', url: '/api/deals', headers: { cookie } });
    expect(deals.json().items.length).toBeGreaterThanOrEqual(3);
  });

  it('keeps a watchlist per user', async () => {
    await app.inject({ method: 'PUT', url: '/api/me/watchlist/76476', headers: { cookie } });
    const w = await app.inject({ method: 'GET', url: '/api/me/watchlist', headers: { cookie } });
    expect(w.json().items.map((i: { set_num: string }) => i.set_num)).toEqual(['76476']);
  });

  it('invites a user by link: one-time use, logs in, then the morning e-mail starts', async () => {
    // no SMTP in tests, so the admin gets the link back to pass on by hand
    const add = await app.inject({
      method: 'POST',
      url: '/api/admin/users',
      headers: { cookie },
      payload: { email: 'Ana@Example.com', name: 'Ana' },
    });
    expect(add.statusCode).toBe(200);
    expect(add.json()).toMatchObject({ ok: true, email: 'ana@example.com', kind: 'invite', emailSent: false });
    const link: string = add.json().link;
    const token = link.split('/poziv/')[1];
    expect(token.length).toBeGreaterThan(30);

    const users = (await app.inject({ method: 'GET', url: '/api/admin/users', headers: { cookie } })).json();
    expect(users.find((u: { email: string }) => u.email === 'ana@example.com')).toMatchObject({ accepted_at: null });
    // pending accounts can't log in and don't get the morning e-mail yet
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'ana@example.com', password: 'anything' } });
    expect(login.statusCode).toBe(401);
    expect(await one("SELECT 1 AS x FROM users WHERE email = 'ana@example.com' AND accepted_at IS NOT NULL")).toBeNull();

    const info = await app.inject({ method: 'GET', url: `/api/auth/invite/${token}` });
    expect(info.json()).toEqual({ email: 'ana@example.com', name: 'Ana', kind: 'invite' });
    const short = await app.inject({ method: 'POST', url: `/api/auth/invite/${token}`, payload: { password: 'kratka' } });
    expect(short.statusCode).toBe(400);
    const accept = await app.inject({ method: 'POST', url: `/api/auth/invite/${token}`, payload: { password: 'anina-lozinka', name: 'Ana P.' } });
    expect(accept.statusCode).toBe(200);
    const anaCookie = String(accept.headers['set-cookie']).split(';')[0];
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: anaCookie } });
    expect(me.json().user).toMatchObject({ email: 'ana@example.com', name: 'Ana P.', role: 'user' });

    // the link works only once
    const again = await app.inject({ method: 'POST', url: `/api/auth/invite/${token}`, payload: { password: 'druga-lozinka' } });
    expect(again.statusCode).toBe(410);
    expect((await app.inject({ method: 'GET', url: `/api/auth/invite/${token}` })).statusCode).toBe(410);
    const relogin = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'ana@example.com', password: 'anina-lozinka' } });
    expect(relogin.statusCode).toBe(200);

    // for an accepted account the admin sends a new-password link; a newer link replaces the older one
    const id = users.find((u: { email: string }) => u.email === 'ana@example.com').id;
    const r1 = (await app.inject({ method: 'POST', url: `/api/admin/users/${id}/invite`, headers: { cookie } })).json();
    const r2 = (await app.inject({ method: 'POST', url: `/api/admin/users/${id}/invite`, headers: { cookie } })).json();
    expect(r2.kind).toBe('reset');
    expect((await app.inject({ method: 'GET', url: `/api/auth/invite/${r1.link.split('/poziv/')[1]}` })).statusCode).toBe(410);
    expect((await app.inject({ method: 'GET', url: `/api/auth/invite/${r2.link.split('/poziv/')[1]}` })).json().kind).toBe('reset');

    // expired links don't work
    await query("UPDATE user_tokens SET expires_at = now() - interval '1 minute' WHERE used_at IS NULL");
    expect((await app.inject({ method: 'GET', url: `/api/auth/invite/${r2.link.split('/poziv/')[1]}` })).statusCode).toBe(410);
  });

  it('records price changes and marks vanished listings as unavailable on the next run', async () => {
    const page1 = readFileSync(path.join(__dirname, 'fixtures/kockarium/page1.html'), 'utf8').replace('13.190,00', '12.490,00');
    await mock.close();
    mock = await startMockShops({
      '/teme-lego/gwp-lego-setovi-kockica/': () => page1.replace(/od 4 rezultata/, 'od 2 rezultata'),
      '/teme-lego/gwp-lego-setovi-kockica/page/2/': () => null,
    });
    config.KOCKARIUM_BASE_URL = mock.base;
    const [k] = await runCrawl({ shops: ['kockarium'], log });
    expect(k).toMatchObject({ status: 'ok', items: 2, priceChanges: 1 });
    const hist = await query(
      `SELECT ph.price_rsd FROM price_history ph JOIN offers o ON o.id = ph.offer_id
        WHERE o.shop_id = 'kockarium' AND o.set_num = '11383' ORDER BY ph.id`,
    );
    expect(hist.map((h) => h.price_rsd)).toEqual([13190, 12490]);
    const gone = await one("SELECT in_stock, active FROM offers WHERE shop_id = 'kockarium' AND external_id = '541906'");
    expect(gone).toEqual({ in_stock: false, active: true });
  });

  it('does not wipe data when a shop suddenly returns nothing', async () => {
    await mock.close();
    mock = await startMockShops({
      '/teme-lego/gwp-lego-setovi-kockica/': () => '<html><body><ul class="products"></ul></body></html>',
    });
    config.KOCKARIUM_BASE_URL = mock.base;
    const [k] = await runCrawl({ shops: ['kockarium'], log });
    expect(k.status).toBe('failed');
    const still = await one("SELECT in_stock, active FROM offers WHERE shop_id = 'kockarium' AND external_id = '541874'");
    expect(still).toEqual({ in_stock: true, active: true });
  });
});

import { readFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { config } from '../src/config.js';
import { startMockShops } from './mockShops.js';

// Outgoing mail is captured instead of sent; off by default, like a server without SMTP
type Sent = { to: string; subject: string; text: string; headers?: Record<string, string>; sender?: 'morning' | 'account' };
const mail = vi.hoisted(() => ({ on: false, fail: false, sent: [] as Sent[] }));
vi.mock('../src/mail/mailer.js', () => ({
  mailConfigured: () => mail.on,
  accountFrom: () => 'Kockolov <nalog@example.com>',
  sendMail: async (m: Sent) => {
    mail.sent.push({ ...m, sender: 'morning' });
  },
  sendAccountMail: async (m: Sent) => {
    if (mail.fail) throw new Error('Invalid login: 535 Incorrect authentication data');
    mail.sent.push({ ...m, sender: 'account' });
  },
}));

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
    config.CRAWLER_SHOPS = 'lstore,kockarium,ananas'; // the members-only shops get their own test below
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

  it('lets people sign up, confirm the address, reset a forgotten password, unsubscribe and delete the account', async () => {
    const { sendDigests } = await import('../src/mail/digest.js');
    const login = (password: string) =>
      app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'pera@example.com', password } });
    config.registrationOpen = true;
    mail.on = true;
    mail.sent.length = 0;
    try {
      // the mail server refuses: the visitor gets an error, and a retry right after the fix sends the mail
      mail.fail = true;
      const refused = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { email: 'pera@example.com', password: 'perina-lozinka', name: 'Pera' },
      });
      expect(refused.statusCode).toBe(502);
      expect(mail.sent).toHaveLength(0);
      mail.fail = false;
      const reg = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { email: 'Pera@Example.com', password: 'perina-lozinka', name: 'Pera' },
      });
      expect(reg.statusCode).toBe(200);
      expect(reg.json()).toEqual({ ok: true, email: 'pera@example.com' });
      expect(reg.headers['set-cookie']).toBeUndefined(); // not signed in before confirming
      expect(mail.sent).toHaveLength(1);
      // account e-mails go out from their own address (nalog@), not the morning one
      expect(mail.sent[0]).toMatchObject({ to: 'pera@example.com', subject: 'Potvrdi e-mail adresu za Kockolov', sender: 'account' });
      const token = mail.sent[0].text.match(/\/potvrda\/([\w-]+)/)![1];

      // a second click right away doesn't send another e-mail
      await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: 'pera@example.com', password: 'perina-lozinka' } });
      expect(mail.sent).toHaveLength(1);

      // unconfirmed: can't log in, gets no morning e-mail
      const early = await login('perina-lozinka');
      expect(early.statusCode).toBe(403);
      expect(early.json().code).toBe('unconfirmed');
      const lines: string[] = [];
      await sendDigests({ dryRun: true, log: (m) => lines.push(m) });
      expect(lines.join('\n')).not.toContain('pera@example.com');

      // a confirmation link can't be used to set a password, only to confirm
      expect((await app.inject({ method: 'GET', url: `/api/auth/invite/${token}` })).json()).toMatchObject({ kind: 'verify' });
      expect((await app.inject({ method: 'POST', url: `/api/auth/invite/${token}`, payload: { password: 'neka-druga' } })).statusCode).toBe(410);
      const ok = await app.inject({ method: 'POST', url: `/api/auth/verify/${token}` });
      expect(ok.statusCode).toBe(200);
      const peraCookie = String(ok.headers['set-cookie']).split(';')[0];
      expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: peraCookie } })).json().user).toMatchObject({
        email: 'pera@example.com',
        name: 'Pera',
      });
      expect((await app.inject({ method: 'POST', url: `/api/auth/verify/${token}` })).statusCode).toBe(410);
      expect((await login('perina-lozinka')).statusCode).toBe(200);
      const later: string[] = [];
      await sendDigests({ dryRun: true, log: (m) => later.push(m) });
      expect(later.join('\n')).toContain('pera@example.com');

      // the address is taken now
      const dup = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: 'pera@example.com', password: 'tudja-lozinka' } });
      expect(dup.statusCode).toBe(409);

      // forgotten password: same answer whether or not the account exists
      mail.sent.length = 0;
      expect((await app.inject({ method: 'POST', url: '/api/auth/forgot', payload: { email: 'niko@example.com' } })).json()).toEqual({ ok: true });
      expect(mail.sent).toHaveLength(0);
      expect((await app.inject({ method: 'POST', url: '/api/auth/forgot', payload: { email: 'pera@example.com' } })).json()).toEqual({ ok: true });
      expect(mail.sent).toHaveLength(1);
      expect(mail.sent[0]).toMatchObject({ subject: 'Link za novu lozinku na Kockolovu', sender: 'account' });
      expect(mail.sent[0].text).toContain('24 sata');
      const reset = mail.sent[0].text.match(/\/poziv\/([\w-]+)/)![1];
      expect((await app.inject({ method: 'POST', url: `/api/auth/invite/${reset}`, payload: { password: 'nova-perina-lozinka' } })).statusCode).toBe(200);
      expect((await login('perina-lozinka')).statusCode).toBe(401);
      const fresh = await login('nova-perina-lozinka');
      expect(fresh.statusCode).toBe(200);
      const cookie2 = String(fresh.headers['set-cookie']).split(';')[0];

      // the morning e-mail carries a one-click unsubscribe
      const { unsubscribe_token: unsub } = (await one("SELECT unsubscribe_token FROM users WHERE email = 'pera@example.com'"))!;
      mail.sent.length = 0;
      await sendDigests({ onlyEmail: 'pera@example.com', log: () => {} });
      expect(mail.sent[0].sender).toBe('morning');
      expect(mail.sent[0].headers).toEqual({
        'List-Unsubscribe': `<${config.APP_URL.replace(/\/$/, '')}/api/unsubscribe/${unsub}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      });
      expect(mail.sent[0].text).toContain(`/odjava/${unsub}`);
      expect((await app.inject({ method: 'GET', url: `/api/unsubscribe/${unsub}` })).json()).toEqual({ email: 'pera@example.com', digestEnabled: true });
      const oneClick = await app.inject({
        method: 'POST',
        url: `/api/unsubscribe/${unsub}`,
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: 'List-Unsubscribe=One-Click',
      });
      expect(oneClick.json()).toEqual({ ok: true, digestEnabled: false });
      expect((await one("SELECT digest_enabled FROM users WHERE email = 'pera@example.com'"))!.digest_enabled).toBe(false);
      expect((await app.inject({ method: 'POST', url: `/api/unsubscribe/${unsub}?on=1` })).json().digestEnabled).toBe(true);
      expect((await app.inject({ method: 'GET', url: '/api/unsubscribe/nije-dobar' })).statusCode).toBe(404);

      // deleting the account needs the password and removes everything
      await app.inject({ method: 'PUT', url: '/api/me/watchlist/10280', headers: { cookie: cookie2 } });
      const wrong = await app.inject({ method: 'DELETE', url: '/api/me', headers: { cookie: cookie2 }, payload: { password: 'pogresna' } });
      expect(wrong.statusCode).toBe(400);
      const del = await app.inject({ method: 'DELETE', url: '/api/me', headers: { cookie: cookie2 }, payload: { password: 'nova-perina-lozinka' } });
      expect(del.statusCode).toBe(200);
      expect(await one("SELECT 1 AS x FROM users WHERE email = 'pera@example.com'")).toBeNull();
      expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: cookie2 } })).json().user).toBeNull();
      // the only admin can't delete the account
      const lastAdmin = await app.inject({ method: 'DELETE', url: '/api/me', headers: { cookie }, payload: { password: 'tajna-lozinka' } });
      expect(lastAdmin.statusCode).toBe(400);
    } finally {
      config.registrationOpen = false;
      mail.on = false;
      mail.fail = false;
    }
  });

  it('keeps sign-up closed while the site is private, and limits sign-ups per IP', async () => {
    const { limits } = await import('../src/api/routes/auth.js');
    const closed = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: 'x@example.com', password: '12345678' } });
    expect(closed.statusCode).toBe(403);
    config.registrationOpen = true;
    try {
      limits.registerIp.clear();
      const codes: number[] = [];
      for (let i = 0; i < 11; i++) {
        const r = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: `bot${i}@example.com`, password: '12345678' } });
        codes.push(r.statusCode);
      }
      expect(codes.slice(0, 10).every((c) => c === 200)).toBe(true);
      expect(codes[10]).toBe(429);
    } finally {
      config.registrationOpen = false;
      limits.registerIp.clear();
      limits.mailIp.clear();
      limits.mailAddress.clear();
    }
  });

  it('serves robots.txt and a sitemap that follow the public mode', async () => {
    const priv = await app.inject({ method: 'GET', url: '/robots.txt' });
    expect(priv.body).toBe('User-agent: *\nDisallow: /\n');
    expect((await app.inject({ method: 'GET', url: '/sitemap.xml' })).statusCode).toBe(404);
    config.PUBLIC_MODE = true;
    try {
      const robots = (await app.inject({ method: 'GET', url: '/robots.txt' })).body;
      expect(robots).toContain('Disallow: /api/');
      expect(robots).toContain('Sitemap: ');
      const map = await app.inject({ method: 'GET', url: '/sitemap.xml' });
      expect(map.headers['content-type']).toContain('application/xml');
      expect(map.body).toContain('/set/10280</loc>');
      expect(map.body).toContain('/privatnost</loc>');
    } finally {
      config.PUBLIC_MODE = false;
    }
  });

  it('gives every page its own head for search engines and link previews', async () => {
    const { pageMeta, injectHead } = await import('../src/seo/pages.js');
    const { plural } = await import('../src/seo/og.js');
    const sharp = (await import('sharp')).default;
    const template = '<html><head><meta name="description" content="x" /><title>x</title></head><body></body></html>';
    const head = async (path: string) => {
      const u = new URL(path, 'http://local');
      const m = await pageMeta(u.pathname, u.searchParams);
      return { m, html: injectHead(template, m) };
    };

    // while the site is private nothing is indexed and nothing is previewed in detail
    const closed = await head('/set/10280');
    expect(closed.m.robots).toBe('noindex, nofollow');
    expect(closed.html).not.toContain('og:image');
    expect((await app.inject({ method: 'GET', url: '/og/set/10280.jpg' })).statusCode).toBe(404);

    config.PUBLIC_MODE = true;
    try {
      const set = await head('/set/10280');
      expect(set.m.status).toBe(200);
      expect(set.html).toMatch(/<title>LEGO 10280 .+ – od 7\.319 RSD \| Kockolov<\/title>/);
      expect(set.html).toContain(`<link rel="canonical" href="${config.APP_URL.replace(/\/$/, '')}/set/10280" />`);
      expect(set.html).toContain('<meta property="og:type" content="product" />');
      expect(set.html).toMatch(/<meta property="og:image" content="[^"]+\/og\/set\/10280\.jpg\?v=[\w-]+" \/>/);
      expect(set.html).toContain('<meta property="product:price:amount" content="7319" />');
      const ld = [...set.html.matchAll(/<script type="application\/ld\+json">(.+?)<\/script>/g)].map((m) => JSON.parse(m[1]));
      const product = ld.find((o) => o['@type'] === 'Product');
      expect(product.offers).toMatchObject({ '@type': 'AggregateOffer', priceCurrency: 'RSD', lowPrice: 7319, availability: 'https://schema.org/InStock' });
      expect(ld.find((o) => o['@type'] === 'BreadcrumbList').itemListElement.length).toBeGreaterThanOrEqual(2);

      // unknown sets and pages are real 404s; private and search pages stay out of the index
      expect((await head('/set/00000')).m).toMatchObject({ status: 404, robots: 'noindex' });
      expect((await head('/nema-ovoga')).m.status).toBe(404);
      expect((await head('/nalog')).m.robots).toBe('noindex, follow');
      expect((await head('/pretraga?q=falcon')).m.robots).toBe('noindex, follow');
      const theme = await head('/pretraga?theme=harry-potter');
      expect(theme.m.title).toBe('LEGO Harry Potter setovi: cene u Srbiji | Kockolov');
      expect(theme.m.canonical).toBe('/pretraga?theme=harry-potter');
      expect((await head('/')).m.jsonLd?.[0]).toMatchObject({ '@type': 'WebSite' });

      // text from the shops can't break out of the HTML
      const { name: original } = (await one("SELECT name FROM sets WHERE set_num = '10280'"))!;
      await query("UPDATE sets SET name = 'Zamak </script><b>' WHERE set_num = '10280'");
      const tricky = (await head('/set/10280')).html;
      expect(tricky).not.toContain('</script><b>');
      expect(tricky).toContain('Zamak &lt;/script&gt;&lt;b&gt;');
      await query("UPDATE sets SET name = $1 WHERE set_num = '10280'", [original]);

      // the preview pictures: 1200×630 JPEG, small enough for WhatsApp
      for (const url of ['/og/set/10280.jpg', '/og/home.jpg', '/og/deals.jpg', '/og/theme/harry-potter.jpg']) {
        const r = await app.inject({ method: 'GET', url });
        expect(r.statusCode, url).toBe(200);
        expect(r.headers['content-type']).toBe('image/jpeg');
        const meta = await sharp(r.rawPayload).metadata();
        expect([meta.width, meta.height]).toEqual([1200, 630]);
        expect(r.rawPayload.length).toBeLessThan(300 * 1024);
      }
      expect((await app.inject({ method: 'GET', url: '/og/set/00000.jpg' })).statusCode).toBe(404);
      expect((await app.inject({ method: 'GET', url: '/og/theme/nema.jpg' })).statusCode).toBe(404);
    } finally {
      config.PUBLIC_MODE = false;
    }

    // 1 prodavnica, 2 prodavnice, 5/11/12 prodavnica, 21 prodavnica, 22 prodavnice, 25/112 prodavnica
    expect([1, 2, 5, 11, 12, 21, 22, 25, 112].map((n) => plural(n, 'a', 'b', 'c')).join('')).toBe('abcccabcc');
  });

  it('lets a user read prices in euros at the NBS rate, on the site and in the morning e-mail', async () => {
    const { refreshEurRate, eurRate } = await import('../src/fx.js');
    const { sendDigests } = await import('../src/mail/digest.js');
    const answer = (o: object) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      // the daily rate is stored; nonsense or an unreachable source keeps the last good one
      fetchSpy.mockResolvedValueOnce(answer({ code: 'EUR', date: '2026-10-01', exchange_middle: 117.4991 }));
      expect(await refreshEurRate(() => {})).toEqual({ rate: 117.4991, day: '2026-10-01' });
      fetchSpy.mockResolvedValueOnce(answer({ code: 'EUR', date: '2026-10-02', exchange_middle: 1.17 }));
      expect(await refreshEurRate(() => {})).toBeNull();
      fetchSpy.mockRejectedValueOnce(new Error('offline'));
      expect(await refreshEurRate(() => {})).toBeNull();
      expect(await eurRate()).toEqual({ rate: 117.4991, day: '2026-10-01' });
    } finally {
      fetchSpy.mockRestore();
    }

    const me = async () => (await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })).json();
    expect((await me()).fx).toEqual({ eur: { rate: 117.4991, day: '2026-10-01' } });
    expect((await me()).user.currency).toBe('RSD');
    const bad = await app.inject({ method: 'PATCH', url: '/api/me', headers: { cookie }, payload: { currency: 'USD' } });
    expect(bad.statusCode).toBe(400);
    expect((await app.inject({ method: 'PATCH', url: '/api/me', headers: { cookie }, payload: { currency: 'EUR' } })).statusCode).toBe(200);
    expect((await me()).user.currency).toBe('EUR');

    // the morning e-mail follows the setting: 7.319 RSD → 62,29 €, with a note about the rate
    mail.on = true;
    mail.sent.length = 0;
    try {
      await query("DELETE FROM digest_log WHERE user_id = (SELECT id FROM users WHERE email = 'milan@example.com')");
      await sendDigests({ onlyEmail: 'milan@example.com', log: () => {} });
      expect(mail.sent).toHaveLength(1);
      const text = mail.sent[0].text.replace(/\u00a0/g, ' ');
      expect(text).toContain('62,29 €');
      expect(text).not.toContain('7.319 RSD');
      expect(text).toContain('srednjem kursu NBS (1 € = 117,50 RSD)');
    } finally {
      mail.on = false;
      await app.inject({ method: 'PATCH', url: '/api/me', headers: { cookie }, payload: { currency: 'RSD' } });
    }
  });

  it('shows members-only shops to signed-in users only', async () => {
    const card = (id: string, name: string, price: string, prev: string, code: string) =>
      `<div class="product-item" data-productid="${id}" data-productname="${name}" data-productprice="${price}"
         data-productprevprice="${prev}" data-productcode="${code}" data-productcat="LEGO® Technic">
         <a href="/lego/${id}-${code.toLowerCase()}"><img src="/files/images/slike_proizvoda/${id}.jpg"></a></div>`;
    const shop = await startMockShops({
      '/lego-kocke': () =>
        `<html><body>${card('501', 'LEGO ICONS BUKET CVECA', '6.999,00', '6.999,00', 'LE10280')}${card('502', 'LEGO TECHNIC NEOM MCLAREN EXTREME E', '8.999,00', '10.999,00', 'LE42166')}</body></html>`,
      '/lego-kocke/page-1': () => null,
    });
    config.SHOP_BASE_URLS = `dexy=${shop.base}`;
    try {
      const [d] = await runCrawl({ shops: ['dexy'], log });
      expect(d).toMatchObject({ status: 'ok', items: 2, matched: 2 });
    } finally {
      config.SHOP_BASE_URLS = undefined;
      await shop.close();
    }
    const get = async (url: string, signedIn: boolean) =>
      (await app.inject({ method: 'GET', url, headers: signedIn ? { cookie } : {} })).json();

    config.PUBLIC_MODE = true;
    try {
      // visitors: the public best price, the set page tells them how many offers they are missing
      expect((await get('/api/sets?q=10280', false)).items[0]).toMatchObject({ best_price: 7319, best_shop: 'ananas' });
      const page = await get('/api/sets/10280', false);
      expect(page.offers.map((o: { shop_id: string }) => o.shop_id)).not.toContain('dexy');
      expect(page).toMatchObject({ hidden_offers: 1, hidden_shops: 1 });
      expect((await get('/api/sets?q=42166&stock=0', false)).total).toBe(0);
      expect((await get('/api/sets/42166', false))).toMatchObject({ offers: [], hidden_offers: 1 });
      expect((await get('/api/shops', false)).map((s: { id: string }) => s.id)).not.toContain('dexy');
      expect(await get('/api/stats', false)).toMatchObject({ shops: 3, members_shops: 1 }); // only shops that have offers count
      const pubDeal = (await get('/api/deals', false)).items.find((i: { set_num: string }) => i.set_num === '10280');
      expect(pubDeal.best_shop).toBe('ananas');
      const map = await app.inject({ method: 'GET', url: '/sitemap.xml' });
      expect(map.body).not.toContain('42166');
      const head = await app.inject({ method: 'GET', url: '/set/10280' });
      expect(head.body).not.toContain('6999');
    } finally {
      config.PUBLIC_MODE = false;
    }

    // signed in: every shop
    expect((await get('/api/sets?q=10280', true)).items[0]).toMatchObject({ best_price: 6999, best_shop: 'dexy' });
    const full = await get('/api/sets/10280', true);
    expect(full.offers[0]).toMatchObject({ shop_id: 'dexy', shop_name: 'Dexy Co', price_rsd: 6999 });
    expect(full.hidden_offers).toBe(0);
    expect((await get('/api/sets?q=42166', true)).items[0]).toMatchObject({ set_num: '42166', name: 'Technic Neom Mclaren Extreme E' });
    expect((await get('/api/shops', true)).find((s: { id: string }) => s.id === 'dexy')).toMatchObject({ members_only: true, offers_in_stock: 2 });
    const memDeal = (await get('/api/deals', true)).items.find((i: { set_num: string }) => i.set_num === '10280');
    expect(memDeal).toMatchObject({ best_shop: 'dexy', best_price_rsd: 6999 });
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

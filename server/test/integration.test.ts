import { readFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { config } from '../src/config.js';
import { normalizeText } from '../src/lib/normalize.js';
import { startMockShops } from './mockShops.js';

// Outgoing mail is captured instead of sent; off by default, like a server without SMTP
type Sent = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  headers?: Record<string, string>;
  replyTo?: string;
  sender?: 'morning' | 'account';
};
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
      expect((await app.inject({ method: 'GET', url: `/api/unsubscribe/${unsub}` })).json()).toEqual({ email: 'pera@example.com', digestEnabled: true, newsEnabled: true });
      const oneClick = await app.inject({
        method: 'POST',
        url: `/api/unsubscribe/${unsub}`,
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: 'List-Unsubscribe=One-Click',
      });
      expect(oneClick.json()).toEqual({ ok: true, digestEnabled: false, newsEnabled: true });
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

  it('lets the admin send a news e-mail to everyone who wants news, after a test copy', async () => {
    const { listAnnouncements } = await import('../src/mail/announce.js');
    config.ANNOUNCE_DELAY_MS = 0;
    const admin = (method: 'GET' | 'POST', url: string, payload?: object) =>
      app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });
    const draft = {
      subject: 'Nove prodavnice na Kockolovu',
      body: 'Od danas vidiš cene iz još 11 prodavnica.\n\n- BigBang i eKupi\n- **Dexy** i Kockalend\n\nPogledaj [ponude dana](https://kockolov.rs/ponude).',
    };
    await query(
      `INSERT INTO users (email, name, role, password_hash, accepted_at, news_enabled) VALUES
         ('vesti-da@example.com', 'Vesna', 'user', 'x', now(), true),
         ('vesti-ne@example.com', 'Nenad', 'user', 'x', now(), false),
         ('vesti-nepotvrdjen@example.com', '', 'user', 'x', NULL, true)`,
    );
    const wants = await query<{ email: string }>('SELECT email FROM users WHERE accepted_at IS NOT NULL AND news_enabled ORDER BY email');
    expect(wants.map((u) => u.email)).toContain('vesti-da@example.com');

    // admins only
    expect((await app.inject({ method: 'GET', url: '/api/admin/announcements' })).statusCode).toBe(401);
    const info = (await admin('GET', '/api/admin/announcements')).json();
    expect(info).toMatchObject({ recipients: wants.length, mailConfigured: false, adminEmail: 'milan@example.com', items: [] });

    // the preview renders paragraphs, a list, bold and links, with the admin's name
    const prev = (await admin('POST', '/api/admin/announcements/preview', draft)).json();
    expect(prev.html).toContain('Ćao Milan,');
    expect(prev.html).toContain('<li style="margin:0 0 6px"><strong>Dexy</strong> i Kockalend</li>');
    expect(prev.html).toContain('<a href="https://kockolov.rs/ponude" style="color:#1d5fd1">ponude dana</a>');

    // without SMTP nothing can be sent
    expect((await admin('POST', '/api/admin/announcements', { ...draft, expected: wants.length })).statusCode).toBe(503);
    mail.on = true;
    mail.sent.length = 0;
    try {
      expect((await admin('POST', '/api/admin/announcements/test', { subject: 'x', body: draft.body })).json()).toMatchObject({
        error: 'Naslov je prekratak.',
      });
      // a test copy to the admin first
      const test = await admin('POST', '/api/admin/announcements/test', draft);
      expect(test.json()).toEqual({ ok: true, email: 'milan@example.com' });
      expect(mail.sent).toHaveLength(1);
      expect(mail.sent[0]).toMatchObject({ to: 'milan@example.com', subject: '[proba] Nove prodavnice na Kockolovu', sender: 'account', replyTo: 'kontakt@kockolov.rs' });
      expect(await one('SELECT count(*)::int AS n FROM announcements')).toEqual({ n: 0 });

      // the confirmation named a number of recipients: refuse if it has changed
      const stale = await admin('POST', '/api/admin/announcements', { ...draft, expected: wants.length + 1 });
      expect(stale.statusCode).toBe(409);
      expect(stale.json().recipients).toBe(wants.length);

      mail.sent.length = 0;
      const send = await admin('POST', '/api/admin/announcements', { ...draft, expected: wants.length });
      expect(send.json()).toMatchObject({ ok: true, recipients: wants.length });
      await vi.waitFor(async () => expect((await listAnnouncements())[0].status).toBe('sent'));
      expect((await listAnnouncements())[0]).toMatchObject({ subject: draft.subject, total: wants.length, sent: wants.length, failed: 0, author: 'Milan' });
      expect(mail.sent.map((m) => m.to).sort()).toEqual(wants.map((u) => u.email));
      const vesna = mail.sent.find((m) => m.to === 'vesti-da@example.com')!;
      expect(vesna.text).toContain('Ćao Vesna,');
      expect(vesna.text).toContain('- BigBang i eKupi');
      expect(vesna.text).toContain('Pogledaj ponude dana (https://kockolov.rs/ponude).');
      const token = (await one<{ unsubscribe_token: string }>("SELECT unsubscribe_token FROM users WHERE email = 'vesti-da@example.com'"))!
        .unsubscribe_token;
      expect(vesna.headers?.['List-Unsubscribe']).toBe(`<${config.APP_URL.replace(/\/$/, '')}/api/unsubscribe/${token}?list=news>`);
      expect(vesna.text).toContain(`/odjava/${token}?lista=novosti`);

      // one click in the mail app turns news off, the morning e-mail stays as it was
      const off = await app.inject({ method: 'POST', url: `/api/unsubscribe/${token}?list=news` });
      expect(off.json()).toMatchObject({ ok: true, newsEnabled: false, digestEnabled: true });
      expect((await app.inject({ method: 'GET', url: `/api/unsubscribe/${token}` })).json()).toMatchObject({ newsEnabled: false, digestEnabled: true });
      expect((await admin('GET', '/api/admin/announcements')).json().recipients).toBe(wants.length - 1);

      // the mail server fails: deliveries are marked, and a retry sends just those
      mail.fail = true;
      const second = await admin('POST', '/api/admin/announcements', { ...draft, subject: 'Druga vest', expected: wants.length - 1 });
      const id = second.json().id;
      await vi.waitFor(async () => expect((await listAnnouncements())[0]).toMatchObject({ id, status: 'sent', failed: wants.length - 1 }));
      mail.fail = false;
      mail.sent.length = 0;
      expect((await admin('POST', `/api/admin/announcements/${id}/retry`)).json()).toEqual({ ok: true, retried: wants.length - 1 });
      await vi.waitFor(async () => expect((await listAnnouncements())[0]).toMatchObject({ id, status: 'sent', sent: wants.length - 1, failed: 0 }));
      expect(mail.sent).toHaveLength(wants.length - 1);

      // a user turns news off in the settings
      const vlogin = await query("UPDATE users SET news_enabled = true WHERE email = 'vesti-da@example.com' RETURNING id");
      expect(vlogin).toHaveLength(1);
      await app.inject({ method: 'PATCH', url: '/api/me', headers: { cookie }, payload: { newsEnabled: false } });
      expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })).json().user).toMatchObject({ news_enabled: false });
      await app.inject({ method: 'PATCH', url: '/api/me', headers: { cookie }, payload: { newsEnabled: true } });
    } finally {
      mail.on = false;
      mail.fail = false;
      await query("DELETE FROM users WHERE email LIKE 'vesti-%@example.com'");
    }
  });

  it('lets the admin hide offers that are not LEGO sets, one by one or by a phrase', async () => {
    const admin = (method: 'GET' | 'POST' | 'DELETE', url: string, payload?: object) =>
      app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });
    // listings like ABC Kocka's Barbie dolls and Nerf blasters
    await query(
      `INSERT INTO offers (shop_id, external_id, seller, title, url, price_rsd, in_stock) VALUES
         ('ananas', 'toy-1', 'Prodavac', 'BARBIE Dreamtopia HLC25 Lutka balerina', 'https://x/1', 2999, true),
         ('ananas', 'toy-2', 'Prodavac', 'NERF Elite 2.0 Flipshots F2551', 'https://x/2', 3999, true),
         ('ananas', 'toy-3', 'Prodavac', 'Hasbro NERF Mega Bulldog E2657', 'https://x/3', 2499, true)`,
    );
    try {
      expect((await app.inject({ method: 'GET', url: '/api/admin/unmatched' })).statusCode).toBe(401);
      expect((await admin('GET', '/api/admin/unmatched?q=nerf')).json().total).toBe(2);
      const barbie = (await admin('GET', '/api/admin/unmatched?q=Barbie%20lutka')).json().items;
      expect(barbie.map((o: { title: string }) => o.title)).toEqual(['BARBIE Dreamtopia HLC25 Lutka balerina']);

      // one by one
      expect((await admin('POST', '/api/admin/offers/hide', { ids: [barbie[0].id] })).json()).toEqual({ ok: true, hidden: 1 });
      expect((await admin('GET', '/api/admin/unmatched?q=barbie')).json().total).toBe(0);

      // by a phrase: hides today's listings and future ones
      const rule = (await admin('POST', '/api/admin/hide-rules', { phrase: 'NERF' })).json();
      expect(rule).toMatchObject({ ok: true, hidden: 2, rule: { phrase: 'nerf', shop_id: null } });
      expect((await admin('POST', '/api/admin/hide-rules', { phrase: 'ab' })).statusCode).toBe(400);
      const hidden = (await admin('GET', '/api/admin/hidden')).json();
      expect(hidden.rules.map((r: { phrase: string }) => r.phrase)).toEqual(['nerf']);
      expect(hidden.items.map((o: { title: string; match_method: string }) => `${o.match_method}: ${o.title}`).sort()).toEqual([
        'hidden: BARBIE Dreamtopia HLC25 Lutka balerina',
        'hidden_rule: Hasbro NERF Mega Bulldog E2657',
        'hidden_rule: NERF Elite 2.0 Flipshots F2551',
      ]);
      const nerf = hidden.items.find((o: { title: string }) => o.title.startsWith('NERF'));
      expect((await admin('POST', `/api/admin/offers/${nerf.id}/restore`)).statusCode).toBe(409);
      expect((await admin('GET', '/api/admin/overview')).json().shops.find((s: { id: string }) => s.id === 'ananas').hidden).toBe(3);

      // deleting the rule brings its offers back to the review list; restoring brings back one
      expect((await admin('DELETE', `/api/admin/hide-rules/${rule.rule.id}`)).json()).toEqual({ ok: true, restored: 2 });
      expect((await admin('POST', `/api/admin/offers/${barbie[0].id}/restore`)).json()).toEqual({ ok: true });
      expect((await admin('GET', '/api/admin/unmatched?q=nerf')).json().total).toBe(2);
      expect((await admin('GET', '/api/admin/unmatched?q=barbie')).json().total).toBe(1);

      // an offer linked to a set leaves the set page, and stays hidden on the next crawl
      const real = (await one<{ id: number; set_num: string; title: string }>(
        "SELECT id, set_num, title FROM offers WHERE shop_id = 'kockarium' AND set_num IS NOT NULL AND in_stock ORDER BY id LIMIT 1",
      ))!;
      await admin('POST', '/api/admin/offers/hide', { ids: [real.id] });
      const page = (await admin('GET', `/api/sets/${real.set_num}`)).json();
      expect(page.offers.map((o: { id: number }) => o.id)).not.toContain(real.id);
      await runCrawl({ shops: ['kockarium'], log });
      expect(await one('SELECT set_num, match_method FROM offers WHERE id = $1', [real.id])).toEqual({ set_num: null, match_method: 'hidden' });
      await admin('POST', `/api/admin/offers/${real.id}/restore`);
      await runCrawl({ shops: ['kockarium'], log });
      expect((await one<{ set_num: string }>('SELECT set_num FROM offers WHERE id = $1', [real.id]))!.set_num).toBe(real.set_num);

      // a rule for one shop also hides the listings that come with the next crawl
      const word = normalizeText(real.title).split(' ').find((w) => w.length > 4 && !/^\d+$/.test(w) && w !== 'lego')!;
      const shopRule = (await admin('POST', '/api/admin/hide-rules', { phrase: word, shopId: 'kockarium' })).json();
      expect(shopRule.hidden).toBeGreaterThan(0);
      await query("UPDATE offers SET match_method = NULL WHERE shop_id = 'kockarium' AND match_method = 'hidden_rule'"); // as if new
      await runCrawl({ shops: ['kockarium'], log });
      expect(await one('SELECT set_num, match_method FROM offers WHERE id = $1', [real.id])).toEqual({ set_num: null, match_method: 'hidden_rule' });
      await admin('DELETE', `/api/admin/hide-rules/${shopRule.rule.id}`);
      await runCrawl({ shops: ['kockarium'], log });
      expect((await one<{ set_num: string }>('SELECT set_num FROM offers WHERE id = $1', [real.id]))!.set_num).toBe(real.set_num);
    } finally {
      await query("DELETE FROM offers WHERE shop_id = 'ananas' AND external_id LIKE 'toy-%'");
      await query('DELETE FROM hide_rules');
    }
  });

  it('keeps set preview images ready, so a shared link shows its picture at once', async () => {
    const { readdirSync } = await import('node:fs');
    const { warmSetCards } = await import('../src/seo/warm.js');
    const cards = (prefix: string) => {
      try {
        return readdirSync(config.OG_CACHE_DIR).filter((f) => f.startsWith(prefix));
      } catch {
        return [];
      }
    };
    expect(await warmSetCards({ pauseMs: 0 })).toEqual({ total: 0, drawn: 0, failed: 0 }); // site still private
    config.PUBLIC_MODE = true;
    try {
      // every set on the public site gets its card ahead of time; the next round has nothing to draw
      const first = await warmSetCards({ pauseMs: 0 });
      expect(first.total).toBeGreaterThan(1);
      expect(first.drawn).toBeGreaterThan(0); // (one or two were already drawn by earlier link previews)
      expect(first.failed).toBe(0);
      expect(cards('set-10280-')).toHaveLength(1);
      expect((await warmSetCards({ pauseMs: 0 })).drawn).toBe(0);

      const get = () => app.inject({ method: 'GET', url: '/og/set/10280.jpg' });
      const ready = await get();
      expect([ready.statusCode, ready.headers['content-type'], ready.headers['cache-control']]).toEqual([200, 'image/jpeg', 'public, max-age=86400']);
      expect(ready.rawPayload.length).toBeLessThan(300_000);

      // a new price: the last card is sent right away (briefly cached) while the new one is drawn
      const offer = (await one<{ id: number; price_rsd: number }>(
        "SELECT id, price_rsd FROM public_offers WHERE set_num = '10280' AND active AND in_stock ORDER BY price_rsd LIMIT 1",
      ))!;
      await query('UPDATE offers SET price_rsd = price_rsd - 500 WHERE id = $1', [offer.id]);
      try {
        const stale = await get();
        expect([stale.statusCode, stale.headers['cache-control']]).toEqual([200, 'public, max-age=600']);
        expect(stale.rawPayload.equals(ready.rawPayload)).toBe(true);
        await vi.waitFor(async () => expect((await get()).headers['cache-control']).toBe('public, max-age=86400'), { timeout: 10000 });
        const fresh = await get();
        expect(fresh.rawPayload.equals(ready.rawPayload)).toBe(false);
        expect(cards('set-10280-')).toHaveLength(1); // the old version is gone
      } finally {
        await query('UPDATE offers SET price_rsd = $2 WHERE id = $1', [offer.id, offer.price_rsd]);
      }
    } finally {
      config.PUBLIC_MODE = false;
    }
  });

  it('publishes blog posts with their picture, link-preview card, structured data and sitemap entry', async () => {
    const { pageMeta, injectHead } = await import('../src/seo/pages.js');
    const sharp = (await import('sharp')).default;
    const slug = 'zasto-sam-napravio-kockolov';

    // while the site is private the blog, like everything else, needs a login
    expect((await app.inject({ method: 'GET', url: '/api/blog' })).statusCode).toBe(401);
    const list = (await app.inject({ method: 'GET', url: '/api/blog', headers: { cookie } })).json();
    const first = list.items.find((p: { slug: string }) => p.slug === slug);
    expect(first).toMatchObject({ title: expect.stringContaining('Kockolov'), date: '2026-10-02', image: { url: `/media/blog/${slug}.jpg` } });
    expect(first.minutes).toBeGreaterThan(0);
    expect(first.html).toBeUndefined();

    const post = (await app.inject({ method: 'GET', url: `/api/blog/${slug}`, headers: { cookie } })).json();
    expect(post.html).toContain('<h2>');
    expect(post.html).toContain('<a href="/set/21061">');
    expect((await app.inject({ method: 'GET', url: '/api/blog/nema-ga', headers: { cookie } })).statusCode).toBe(404);

    const pic = await app.inject({ method: 'GET', url: `/media/blog/${slug}.jpg` });
    expect([pic.statusCode, pic.headers['content-type']]).toEqual([200, 'image/jpeg']);
    expect((await app.inject({ method: 'GET', url: '/media/blog/..%2Fpackage.json' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/og/blog/${slug}.jpg` })).statusCode).toBe(404); // site still private

    config.PUBLIC_MODE = true;
    try {
      const m = await pageMeta(`/blog/${slug}`, new URLSearchParams());
      expect(m).toMatchObject({ status: 200, canonical: `/blog/${slug}`, type: 'article', title: 'Zašto sam napravio Kockolov | LEGO cene u Srbiji' });
      const html = injectHead('<html><head><meta name="description" content="x" /><title>x</title></head><body></body></html>', m);
      expect(html).toContain('<meta property="og:type" content="article" />');
      expect(html).toContain('<meta property="article:published_time" content="2026-10-02" />');
      expect(html).toContain(`/og/blog/${slug}.jpg?v=`);
      expect(html).toContain('"@type":"BlogPosting"');
      expect(html).toContain('"articleBody":"Kockolov nije počeo');
      expect((await pageMeta('/blog/nema-ga', new URLSearchParams())).status).toBe(404);
      // the blog page's link preview is the newest post's card
      expect((await pageMeta('/blog', new URLSearchParams())).image?.url).toContain(`/og/blog/${list.items[0].slug}.jpg`);

      const card = await app.inject({ method: 'GET', url: `/og/blog/${slug}.jpg` });
      expect(card.headers['content-type']).toBe('image/jpeg');
      expect(await sharp(card.rawPayload).metadata()).toMatchObject({ width: 1200, height: 630 });

      const map = (await app.inject({ method: 'GET', url: '/sitemap.xml' })).body;
      expect(map).toContain('/blog</loc>');
      expect(map).toContain(`/blog/${slug}</loc><lastmod>2026-10-02</lastmod>`);
    } finally {
      config.PUBLIC_MODE = false;
    }
  });

  it('lists every offer with its set, and lets the admin fix a mistyped set number', async () => {
    const admin = (method: 'GET' | 'POST', url: string, payload?: object) =>
      app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });
    const offer = (await one<{ id: number; set_num: string; title: string }>(
      `SELECT id, set_num, title FROM offers
        WHERE shop_id = 'kockarium' AND set_num IS NOT NULL AND in_stock AND match_method <> 'manual' AND title LIKE set_num || '%'
        ORDER BY id LIMIT 1`,
    ))!;
    const right = offer.set_num;
    const other = (await one<{ set_num: string }>('SELECT set_num FROM sets WHERE set_num <> $1 ORDER BY set_num LIMIT 1', [right]))!.set_num;
    // two digits swapped, a number no shop sells
    let typo = right.slice(0, 3) + right[4] + right[3] + right.slice(5);
    if (typo === right || (await one('SELECT 1 FROM sets WHERE set_num = $1', [typo]))) typo = '99' + right.slice(2);

    expect((await app.inject({ method: 'GET', url: '/api/admin/offers' })).statusCode).toBe(401);
    const all = (await admin('GET', '/api/admin/offers')).json();
    expect(all.total).toBe(all.counts.all);
    expect(all.counts.all).toBe(all.counts.linked + all.counts.open + all.counts.merch + all.counts.hidden);
    // a search by set number finds the offers linked to it
    const bySet = (await admin('GET', `/api/admin/offers?q=${right}`)).json();
    expect(bySet.items.map((o: { id: number }) => o.id)).toContain(offer.id);
    expect(bySet.items.find((o: { id: number }) => o.id === offer.id)).toMatchObject({ set_num: right, doubts: [] });
    // sorted and paged
    const paged = (await admin('GET', '/api/admin/offers?filter=linked&sort=price&dir=desc&size=10&page=2')).json();
    expect(paged).toMatchObject({ page: 2, size: 10, sort: 'price' });
    const prices = paged.items.map((o: { price_rsd: number }) => o.price_rsd);
    expect(prices).toEqual([...prices].sort((a, b) => b - a));

    // the number shows its set while typing; an unknown one needs a second, explicit confirmation
    expect((await admin('GET', `/api/admin/sets/${right}`)).json()).toMatchObject({ set_num: right });
    expect((await admin('GET', `/api/admin/sets/${typo}`)).json()).toMatchObject({ code: 'unknown_set' });
    expect((await admin('POST', `/api/admin/offers/${offer.id}/match`, { setNum: 'abc' })).statusCode).toBe(400);
    const refused = await admin('POST', `/api/admin/offers/${offer.id}/match`, { setNum: typo });
    expect([refused.statusCode, refused.json().code]).toEqual([409, 'unknown_set']);
    expect((await admin('POST', `/api/admin/offers/${offer.id}/match`, { setNum: typo, confirmNew: true })).json()).toMatchObject({
      ok: true,
      previous: right,
      setNum: typo,
    });

    // the wrong link stands out: hand-made, and the title names another set
    const manual = (await admin('GET', '/api/admin/offers?filter=manual')).json();
    expect(manual.items[0]).toMatchObject({ id: offer.id, set_num: typo, match_method: 'manual', doubts: [{ kind: 'number', num: right }] });
    expect(manual.items[0].manual_by).toBeTruthy();
    expect(manual.items[0].manual_at).toBeTruthy();
    expect((await admin('GET', '/api/admin/offers?filter=check')).json().items.map((o: { id: number }) => o.id)).toContain(offer.id);

    // a hand-made link survives the crawl
    await runCrawl({ shops: ['kockarium'], log });
    expect(await one('SELECT set_num, match_method FROM offers WHERE id = $1', [offer.id])).toEqual({ set_num: typo, match_method: 'manual' });

    // fixing it removes the set the typo made
    expect((await admin('POST', `/api/admin/offers/${offer.id}/match`, { setNum: other })).json()).toMatchObject({ setNum: other, dropped: [typo] });
    expect(await one('SELECT 1 FROM sets WHERE set_num = $1', [typo])).toBeNull();
    expect((await admin('GET', `/api/sets/${typo}`)).statusCode).toBe(404);

    // back to automatic: linked right away the way the crawler links it
    const back = (await admin('POST', `/api/admin/offers/${offer.id}/auto`)).json();
    expect(back).toMatchObject({ ok: true, previous: other, setNum: right });
    expect(await one('SELECT set_num, match_method <> $2 AS auto, manual_at FROM offers WHERE id = $1', [offer.id, 'manual'])).toEqual({
      set_num: right,
      auto: true,
      manual_at: null,
    });
    expect((await admin('GET', `/api/sets/${right}`)).json().offers.map((o: { id: number }) => o.id)).toContain(offer.id);

    // a hidden offer comes back linked, without waiting for the next crawl
    await admin('POST', '/api/admin/offers/hide', { ids: [offer.id] });
    expect((await admin('GET', '/api/admin/offers?filter=hidden')).json().items.map((o: { id: number }) => o.id)).toContain(offer.id);
    await admin('POST', `/api/admin/offers/${offer.id}/restore`);
    expect((await one<{ set_num: string }>('SELECT set_num FROM offers WHERE id = $1', [offer.id]))!.set_num).toBe(right);
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

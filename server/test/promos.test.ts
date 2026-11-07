import { readFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { describe, expect, it } from 'vitest';

const fx = (p: string) => readFileSync(path.join(__dirname, 'fixtures', 'promos', p), 'utf8');

const dbAvailable = await (async () => {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 1500 });
  try {
    await c.connect();
    await c.end();
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!dbAvailable)('promotions: crawler proposes, admin decides', async () => {
  const { pool, migrate, query, one } = await import('../src/db.js');
  const { runPromoCrawl } = await import('../src/crawler/promos/run.js');
  const { upsertCandidate } = await import('../src/crawler/promos/store.js');
  await migrate();
  for (const [id, name, members] of [['lstore', 'LEGO® Store', false], ['kockarium', 'Kockarium', false], ['dexy', 'Dexy Co', true]] as const) {
    await query(
      `INSERT INTO shops (id, name, url, kind, members_only) VALUES ($1, $2, $3, 'shop', $4) ON CONFLICT (id) DO UPDATE SET members_only = $4`,
      [id, name, `https://${id}.example`, members],
    );
  }
  await query('DELETE FROM promos');

  const pages: Record<string, string> = {
    'https://lstore.rs/blogs/vesti.atom': fx('lstore.atom'),
    'https://lstore.rs/': fx('lstore-home.html'),
    'https://lstore.rs/blogs/vesti/poklon-icons': '<html><body><p>Poklon za LEGO Icons kupce, porudžbine preko 20.000 RSD.</p></body></html>',
    'https://www.kockarium.rs/lego-kocke-akcija/': fx('kockarium-akcija.html'),
    'https://www.dexy.co.rs/akcije-i-snizenja': fx('dexy-akcije.html'),
  };
  const http = { get: async (url: string) => (url in pages ? { status: 200, text: pages[url] } : { status: 404, text: '' }) };
  const now = new Date('2026-11-07T08:00:00Z');

  it('stores what it reads as pending, never approved, and tolerates a failing page', async () => {
    const rows = await runPromoCrawl({ http, now });
    expect(rows.find((r) => r.source.endsWith('/lego-kocke'))?.error).toMatch(/404/);
    expect(rows.reduce((n, r) => n + r.added, 0)).toBeGreaterThanOrEqual(3);
    const all = await query<{ status: string; shop_id: string; title: string; min_basket_rsd: number | null }>('SELECT * FROM promos');
    expect(all.every((p) => p.status === 'pending')).toBe(true);
    expect(all.some((p) => p.shop_id === 'lstore' && p.min_basket_rsd === 15000)).toBe(true);
    expect(all.some((p) => p.shop_id === 'lstore' && p.min_basket_rsd === 20000)).toBe(true); // from the feed
    expect(all.some((p) => p.min_basket_rsd === 9000)).toBe(false); // old blog post skipped
    expect(all.some((p) => /bebe/i.test(p.title))).toBe(false); // Dexy: not LEGO
  });

  it('checks each promotion on its own page: an entry whose page says it expired is dropped, and stored ones are closed', async () => {
    const expiredPage = '<html><body><div>Ova promocija je istekla.</div><p>Potrošite preko 20.000 RSD i dobijate poklon.</p></body></html>';
    const gone = { get: async (url: string) => (url === 'https://lstore.rs/blogs/vesti/poklon-icons' ? { status: 200, text: expiredPage } : http.get(url)) };
    await query('DELETE FROM promos');
    await runPromoCrawl({ http: gone, now });
    expect((await query(`SELECT 1 FROM promos WHERE source_url = 'https://lstore.rs/blogs/vesti/poklon-icons'`)).length).toBe(0);

    // the same promotion was stored (and approved) earlier, while its page was still alive
    await runPromoCrawl({ http, now });
    const row = await one<{ id: number }>(`SELECT id FROM promos WHERE source_url = 'https://lstore.rs/blogs/vesti/poklon-icons'`);
    await query(`UPDATE promos SET status = 'approved' WHERE id = $1`, [row!.id]);
    await runPromoCrawl({ http: gone, now });
    const after = await one<{ over: boolean }>('SELECT valid_until < current_date AS over FROM promos WHERE id = $1', [row!.id]);
    expect(after!.over).toBe(true);
    await query('DELETE FROM promos');
    await runPromoCrawl({ http, now });
  });

  it('the same promotion on several pages or worded a little differently is one proposal', async () => {
    const { dedupePromos, similarity } = await import('../src/crawler/promos/dedupe.js');
    expect(similarity('Poklon uz porudžbine preko 15.000 RSD, LEGO poklon set', 'Akcija: poklon uz porudžbine preko 15.000 RSD, LEGO poklon set važi do 31.12.')).toBeGreaterThan(0.75);
    expect(similarity('Poklon uz porudžbine preko 15.000 RSD', 'Dodatnih 10% samo online na Star Wars')).toBeLessThan(0.5);
    await query('DELETE FROM promos');
    const mk = (title: string, details: string, url: string) => ({
      kind: 'gift' as const, title, details, minBasketRsd: 15000, discountPct: null, themes: [],
      validFrom: null, validUntil: null, sourceUrl: url, signals: 1,
    });
    await upsertCandidate('lstore', mk('Poklon uz kupovinu', 'Poklon uz porudžbine preko 15.000 RSD, izaberi LEGO poklon set pri plaćanju', 'https://lstore.rs/'));
    // same text on another page, different title, and a nested copy
    await upsertCandidate('lstore', mk('Poklon set', 'Poklon uz porudžbine preko 15.000 RSD, izaberi LEGO poklon set pri plaćanju. Važi za sve.', 'https://lstore.rs/blogs/vesti/x'));
    await upsertCandidate('lstore', mk('Poklon', 'izaberi LEGO poklon set pri plaćanju, uz porudžbine preko 15.000 RSD', 'https://lstore.rs/sniz'));
    expect((await one<{ n: number }>('SELECT count(*)::int AS n FROM promos'))!.n).toBe(1);
    // duplicates that are already stored are cleaned up, a decided one wins over a waiting look-alike
    await query(`INSERT INTO promos (shop_id, kind, title, details, source_url, status) VALUES ('lstore','gift','Isto','Poklon uz porudžbine preko 15.000 RSD, izaberi LEGO poklon set pri plaćanju','https://lstore.rs/dup','pending')`);
    await query(`INSERT INTO promos (shop_id, kind, title, details, source_url, status) VALUES ('kockarium','sale','Drugo','Dodatnih 10% samo online na LEGO Star Wars','https://k.rs/a','pending')`);
    await query(`UPDATE promos SET status = 'approved' WHERE shop_id = 'lstore' AND source_url = 'https://lstore.rs/'`);
    expect(await dedupePromos()).toBe(1);
    expect((await one<{ n: number }>('SELECT count(*)::int AS n FROM promos'))!.n).toBe(2);
    await query('DELETE FROM promos');
    await runPromoCrawl({ http, now });
  });

  it('running again changes nothing', async () => {
    const before = (await one<{ n: number }>('SELECT count(*)::int AS n FROM promos'))!.n;
    const rows = await runPromoCrawl({ http, now });
    expect(rows.reduce((n, r) => n + r.added + r.changed, 0)).toBe(0);
    expect((await one<{ n: number }>('SELECT count(*)::int AS n FROM promos'))!.n).toBe(before);
  });

  it('an approved promotion whose text changes goes back to pending; a rejected one stays rejected', async () => {
    const [a, b] = await query<{ id: number; shop_id: string; kind: string; title: string; source_url: string; details: string }>(
      `SELECT * FROM promos WHERE shop_id = 'lstore' ORDER BY id LIMIT 2`,
    );
    await query(`UPDATE promos SET status = 'approved' WHERE id = $1`, [a.id]);
    await query(`UPDATE promos SET status = 'rejected' WHERE id = $1`, [b.id]);
    const cand = (p: typeof a, details: string) => ({
      kind: p.kind as 'gift', title: p.title, details, minBasketRsd: null, discountPct: null, themes: [],
      validFrom: null, validUntil: null, sourceUrl: p.source_url, signals: 1,
    });
    expect((await upsertCandidate('lstore', cand(a, a.details + ' Nova pravila.'))).action).toBe('changed');
    expect((await upsertCandidate('lstore', cand(b, b.details + ' Nova pravila.'))).action).toBe('seen');
    const after = await query<{ id: number; status: string; changed: boolean }>('SELECT id, status, changed FROM promos WHERE id = ANY($1)', [[a.id, b.id]]);
    expect(after.find((p) => p.id === a.id)).toMatchObject({ status: 'pending', changed: true });
    expect(after.find((p) => p.id === b.id)).toMatchObject({ status: 'rejected' });
  });

  it('visitors see only approved, valid promotions, and members-only shops stay hidden', async () => {
    const { buildApp } = await import('../src/api/app.js');
    const { config } = await import('../src/config.js');
    config.PUBLIC_MODE = true; // open to visitors, like the live site
    const app = await buildApp();
    await query(`UPDATE promos SET status = 'pending'`);
    await query(`UPDATE promos SET status = 'approved' WHERE id IN (SELECT id FROM promos WHERE shop_id = 'lstore' LIMIT 1)`);
    await query(`UPDATE promos SET status = 'approved' WHERE id IN (SELECT id FROM promos WHERE shop_id = 'dexy' LIMIT 1)`);
    await query(`UPDATE promos SET status = 'approved', valid_until = current_date - 1 WHERE id IN (SELECT id FROM promos WHERE shop_id = 'kockarium' LIMIT 1)`);
    const res = await app.inject({ method: 'GET', url: '/api/akcije' });
    expect(res.statusCode, res.body).toBe(200);
    const items = res.json().items as { shop_id: string }[];
    expect(items.map((i) => i.shop_id)).toEqual(['lstore']);
    expect((await app.inject({ method: 'GET', url: '/api/admin/akcije' })).statusCode).toBe(401);
    // the page has its own head, counting only what visitors can see (the one L Store promotion)
    const { pageMeta } = await import('../src/seo/pages.js');
    const meta = await pageMeta('/akcije', new URLSearchParams());
    expect(meta.title).toContain('Akcije');
    expect(meta.canonical).toBe('/akcije');
    expect(meta.description).toContain('1 aktuelna akcija');
    await app.close();
    await pool.end();
  });
});

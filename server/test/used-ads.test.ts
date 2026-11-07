import pg from 'pg';
import { describe, expect, it } from 'vitest';

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

describe.skipIf(!dbAvailable)('second-hand ads next to the shops and in search; ad share card', async () => {
  const { pool, migrate, query, one } = await import('../src/db.js');
  const { config } = await import('../src/config.js');
  const { buildApp } = await import('../src/api/app.js');
  await migrate();
  config.PUBLIC_MODE = true;
  config.LISTINGS_MODE = 'on';
  const app = await buildApp();

  await query('DELETE FROM listings');
  await query("DELETE FROM sets WHERE set_num IN ('99001', '99002')");
  const user = await one<{ id: number }>(
    `INSERT INTO users (email, name, role, password_hash, accepted_at) VALUES ('used-ads@example.com', 'Prodavac', 'user', 'x', now())
     ON CONFLICT (email) DO UPDATE SET name = 'Prodavac' RETURNING id`,
  );
  // 99001: sold by a shop and in ads; 99002: only in ads
  await query(`INSERT INTO sets (set_num, name, search_text) VALUES ('99001', 'Probni set sa prodavnicom', 'probni set sa prodavnicom 99001'), ('99002', 'Probni set samo oglas', 'probni set samo oglas 99002')`);
  await query(`INSERT INTO shops (id, name, url, kind, members_only) VALUES ('probna', 'Probna', 'https://p.example', 'shop', false) ON CONFLICT (id) DO NOTHING`);
  await query(
    `INSERT INTO offers (shop_id, external_id, title, url, set_num, price_rsd, in_stock, active) VALUES ('probna', 'x1', 'Probni set', 'https://p.example/x1', '99001', 9000, true, true)
     ON CONFLICT (shop_id, external_id) DO UPDATE SET set_num = '99001', in_stock = true, active = true`,
  );
  const ad = (title: string, set: string, price: number, status = 'active') =>
    query(
      `INSERT INTO listings (user_id, title, set_num, condition, price_rsd, city, status) VALUES ($1, $2, $3, 'used_complete', $4, 'Niš', $5)`,
      [user!.id, title, set, price, status],
    );
  await ad('Probni set, kompletan', '99001', 6000);
  await ad('Probni set, sa kutijom', '99001', 7000);
  await ad('Prodat', '99001', 5000, 'sold');
  await ad('Samo u oglasu', '99002', 4500);

  it('lists the active ads of a set (cheapest first) as used offers, not the sold ones', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/sets/99001' });
    expect(res.statusCode).toBe(200);
    expect(res.json().used.map((u: { price_rsd: number }) => u.price_rsd)).toEqual([6000, 7000]);
    expect(res.json().offers).toHaveLength(1);
  });

  it('shows how many ads and from what price on the search results', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/sets?q=probni' });
    const hit = res.json().items.find((i: { set_num: string }) => i.set_num === '99001');
    expect(hit).toMatchObject({ used_count: 2, used_min_price: 6000 });
  });

  it('finds a set that exists only in ads, in its own group', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/sets?q=probni' });
    expect(res.json().used_only.map((s: { set_num: string }) => s.set_num)).toEqual(['99002']);
    expect(res.json().used_only[0]).toMatchObject({ used_count: 1, used_min_price: 4500 });
    // the page of that set lists the ad
    expect((await app.inject({ method: 'GET', url: '/api/sets/99002' })).json().used).toHaveLength(1);
  });

  it('shows no ads when Oglasi is off', async () => {
    config.LISTINGS_MODE = 'off';
    const res = await app.inject({ method: 'GET', url: '/api/sets/99001' });
    expect(res.json().used).toEqual([]);
    expect(res.json().offers).toHaveLength(1);
    expect((await app.inject({ method: 'GET', url: '/api/sets?q=probni' })).json().used_only).toEqual([]);
    config.LISTINGS_MODE = 'on';
  });

  it('gives an ad a 1200×630 preview card, and the page points to it', async () => {
    const id = (await one<{ id: number }>("SELECT id FROM listings WHERE title = 'Probni set, kompletan'"))!.id;
    const { pageMeta } = await import('../src/seo/pages.js');
    const m = await pageMeta(`/oglasi/${id}`, new URLSearchParams());
    expect(m.image?.url).toMatch(new RegExp(`^/og/oglas/${id}\\.jpg\\\?v=`));
    expect(m.image?.width ?? 1200).toBe(1200);
    expect(m.image?.height ?? 630).toBe(630);
    const img = await app.inject({ method: 'GET', url: `/og/oglas/${id}.jpg` });
    expect(img.statusCode).toBe(200);
    expect(img.headers['content-type']).toBe('image/jpeg');
    expect(img.rawPayload.length).toBeGreaterThan(5000);
    expect((await app.inject({ method: 'GET', url: '/og/oglas/999999.jpg' })).statusCode).toBe(404);
  });

  it('cleans up', async () => {
    await query('DELETE FROM listings');
    await query("DELETE FROM offers WHERE shop_id = 'probna'");
    await query("DELETE FROM sets WHERE set_num IN ('99001', '99002')");
    await app.close();
    await pool.end();
  });
});

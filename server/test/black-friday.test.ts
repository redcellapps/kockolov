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

describe.skipIf(!dbAvailable)('Crni petak: discounts checked against the 30-day low', async () => {
  const { migrate, query } = await import('../src/db.js');
  const { blackFriday } = await import('../src/deals/blackFriday.js');
  await migrate();

  for (const [id, kind] of [['bfstore', 'official'], ['bfshop', 'shop']] as const) {
    await query(`INSERT INTO shops (id, name, url, kind) VALUES ($1, $1, $2, $3) ON CONFLICT (id) DO NOTHING`, [id, `https://${id}.example`, kind]);
  }
  await query("DELETE FROM offers WHERE shop_id = 'bfshop'");
  await query("DELETE FROM sets WHERE set_num LIKE '9900_'");

  /** a set with a 10.000 RSD LEGO Store price, one offer now, and its price history (days ago, price) */
  const set = async (num: string, now: number, history: [number, number, boolean?][]) => {
    await query(`INSERT INTO sets (set_num, name, rrp_rsd) VALUES ($1, $2, 10000)`, [num, `Set ${num}`]);
    const [o] = await query<{ id: number }>(
      `INSERT INTO offers (shop_id, external_id, set_num, title, url, price_rsd, in_stock) VALUES ('bfshop', $1, $1, $1, 'https://bfshop.example', $2, true) RETURNING id`,
      [num, now],
    );
    for (const [daysAgo, price, inStock = true] of history) {
      await query(`INSERT INTO price_history (offer_id, price_rsd, in_stock, recorded_at) VALUES ($1, $2, $3, now() - make_interval(days => $4))`, [
        o.id,
        price,
        inStock,
        daysAgo,
      ]);
    }
  };
  await set('99001', 8000, [[20, 9000], [0, 8000]]); // a real new low
  await set('99002', 8500, [[10, 7000], [0, 8500]]); // was cheaper 10 days ago: not a real Black Friday price
  await set('99003', 9500, [[0, 9500]]); // only 5% off: not listed
  await set('99004', 8000, [[40, 8000]]); // the same price since before the 30 days: still the lowest
  await set('99005', 8800, [[0, 8800]]); // no history before today: unknown
  await set('99006', 7000, [[12, 6500, false], [0, 7000]]); // the cheaper price was out of stock: doesn't count

  it('lists sets at least 10% below the LEGO Store and says which prices are really the lowest', async () => {
    const bf = await blackFriday({ fresh: true });
    const mine = bf.items.filter((i) => i.set_num.startsWith('9900'));
    expect(mine.map((i) => i.set_num)).toEqual(['99006', '99001', '99004', '99002', '99005']); // by discount
    const by = Object.fromEntries(mine.map((i) => [i.set_num, i]));
    expect(by['99001']).toMatchObject({ pct: 20, best_price: 8000, min30: 9000, real: true });
    expect(by['99002']).toMatchObject({ pct: 15, min30: 7000, real: false });
    expect(by['99002'].min30_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(by['99004']).toMatchObject({ min30: 8000, real: true });
    expect(by['99005']).toMatchObject({ min30: null, real: null });
    expect(by['99006']).toMatchObject({ pct: 30, min30: null, real: null });
    expect(bf.date).toBe('2026-11-27');
    expect(bf.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('has its own head, crawler copy and preview card', async () => {
    const { config } = await import('../src/config.js');
    const { pageMeta, loadCollection } = await import('../src/seo/pages.js');
    config.PUBLIC_MODE = true;
    try {
      const m = await pageMeta('/crni-petak', new URLSearchParams());
      expect(m).toMatchObject({ status: 200, canonical: '/crni-petak', title: 'Crni petak 2026: LEGO popusti i provera cena | Kockolov' });
      expect(m.description).toMatch(/^Black Friday LEGO popusti u Srbiji: \d+ set/);
      expect(m.image?.url).toMatch(/^\/og\/crni-petak\.jpg\?v=/);
      expect(m.body).toContain('<h1>Crni petak 2026: LEGO popusti</h1>');
      expect(m.body).toContain('href="/set/99001"');
      expect(m.body).toContain('najniža cena u poslednjih 30 dana');
      expect(m.body).toMatch(/bilo je i jeftinije: 7\.000\u00a0RSD, \d+\. [a-z]+a/);
      expect((await loadCollection('crni-petak'))?.title).toBe('Crni petak: LEGO popusti');
    } finally {
      config.PUBLIC_MODE = false;
    }
  });
});

// Export the demo database (npm run demo) into web/src/demo/snapshot.json for the in-browser
// preview build (npm run build:demo -w web). Needs the demo data loaded first.
//
//   npm run demo -w server -- --reset
//   npx tsx server/scripts/export-demo.ts
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/api/app.js';
import { pool, query } from '../src/db.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(here, '..', '..', 'web');
const EMAIL = process.env.DEMO_EMAIL ?? 'demo@kockolov.local';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'demo1234';

async function main() {
  const app = await buildApp({ logger: false });
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: EMAIL, password: PASSWORD } });
  if (login.statusCode !== 200) throw new Error(`login failed (${login.statusCode}): run the demo script first`);
  const cookie = login.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const get = async (url: string) => {
    const res = await app.inject({ method: 'GET', url, headers: { cookie } });
    if (res.statusCode !== 200) throw new Error(`${url} -> ${res.statusCode}`);
    return res.json();
  };

  const sets = await query(
    `SELECT s.set_num, s.name, s.theme_slug, t.name AS theme_name, s.image_url, s.rrp_rsd, s.age_min,
            s.created_at, s.search_text
       FROM sets s LEFT JOIN themes t ON t.slug = s.theme_slug ORDER BY s.set_num`,
  );
  const offers = await query(
    `SELECT id, set_num, shop_id, seller, price_rsd, regular_price_rsd, in_stock
       FROM offers WHERE active AND set_num IS NOT NULL ORDER BY id`,
  );
  const latestDeals = await query(`SELECT set_num, score, rank FROM deals WHERE day = (SELECT max(day) FROM deals)`);

  // The demo crawled fake local shops that mirror the real URL paths; point links at the real shops.
  const SHOP_BASE: Record<string, string> = {
    lstore: 'https://lstore.rs',
    kockarium: 'https://www.kockarium.rs',
    ananas: 'https://ananas.rs',
  };
  const realUrl = (o: { shop_id: string; url: string }) => o.url.replace(/^http:\/\/127\.0\.0\.1:\d+/, SHOP_BASE[o.shop_id] ?? '');

  const details: Record<string, unknown> = {};
  for (const s of sets) {
    const { related: _r, watched: _w, ...d } = await get(`/api/sets/${encodeURIComponent(s.set_num)}`);
    d.offers = d.offers.map((o: { shop_id: string; url: string }) => ({ ...o, url: realUrl(o) }));
    details[s.set_num] = d;
  }

  const imgDir = path.join(webDir, 'public', 'demo-img');
  const images: Record<string, string> = {};
  for (const f of readdirSync(imgDir).filter((f) => f.endsWith('.svg'))) {
    images[f.replace(/\.svg$/, '')] = `data:image/svg+xml,${encodeURIComponent(readFileSync(path.join(imgDir, f), 'utf8'))}`;
  }

  const me = await get('/api/auth/me');
  const snapshot = {
    exportedAt: new Date().toISOString(),
    user: me.user,
    stats: await get('/api/stats'),
    shops: await get('/api/shops'),
    themes: await get('/api/themes'),
    deals: await get('/api/deals?limit=40'),
    sets,
    offers,
    latestDeals,
    details,
    admin: {
      overview: await get('/api/admin/overview'),
      unmatched: (await get('/api/admin/unmatched')).map((o: { shop_id: string; url: string }) => ({ ...o, url: realUrl(o) })),
      users: await get('/api/admin/users'),
    },
    images,
  };
  const out = path.join(webDir, 'src', 'demo', 'snapshot.json');
  writeFileSync(out, JSON.stringify(snapshot));
  console.log(`${sets.length} sets, ${offers.length} offers, ${Object.keys(images).length} images -> ${path.relative(process.cwd(), out)}`);
  await app.close();
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

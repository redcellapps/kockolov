/**
 * Local demo without touching the real shops.
 *
 *   npm run demo -w server        (needs DATABASE_URL)
 *
 * Serves a snapshot of real listings (LEGO Store, Kockarium, Ananas — captured 28 Sep 2026,
 * ~190 sets) as if it were the three shops, runs the normal crawl pipeline against it three
 * times with shifted dates so there is price history, and creates demo@kockolov.local / demo1234.
 * Product images are replaced by generated placeholders (the real CDNs are not contacted).
 * --keep-server keeps the fake shops running; --reset wipes the database first.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '../src/api/auth.js';
import { config } from '../src/config.js';
import { runCrawl } from '../src/crawler/pipeline.js';
import { computeDeals } from '../src/deals/engine.js';
import { migrate, pool, query } from '../src/db.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f: string) =>
  readFileSync(path.join(here, 'demo-data', f), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => l.split('|'));

const lstore = read('lstore.txt'); // id|sku|title|handle|type|price|available|img
const kockarium = read('kockarium.txt'); // id|sku|title|price|regular|stock|adult|cats|slug
const ananas = read('ananas.txt'); // id|price|base|stock|qty|seller|title|cat

// Deterministic "yesterday's prices": some offers were more expensive (or cheaper) before
function shift(id: string, price: number, day: number): number {
  if (day === 0) return price; // today = the real snapshot
  const h = [...`${id}:${day}`].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const r = h % 10;
  if (r < 2) return Math.round((price * 1.12) / 10) * 10 - 1; // was 12% more expensive
  if (r === 2) return Math.round((price * 0.95) / 10) * 10 - 1; // was cheaper
  return price;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#e34948', '#4a3aa7', '#008300', '#e87ba4', '#eda100'];

function placeholder(label: string): string {
  const h = [...label].reduce((a, c) => (a * 17 + c.charCodeAt(0)) >>> 0, 3);
  const c = PALETTE[h % PALETTE.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
<rect width="400" height="400" fill="#ffffff"/>
<rect x="70" y="120" width="260" height="190" rx="18" fill="${c}"/>
<rect x="70" y="270" width="260" height="40" rx="18" fill="rgba(0,0,0,.15)"/>
<rect x="110" y="84" width="60" height="44" rx="10" fill="${c}"/><rect x="230" y="84" width="60" height="44" rx="10" fill="${c}"/>
<text x="200" y="222" font-family="Arial,Helvetica,sans-serif" font-size="46" font-weight="700" fill="#fff" text-anchor="middle">${esc(label)}</text>
</svg>`;
}

function startFakeShops(day: number) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const send = (body: string, type = 'text/html; charset=utf-8', status = 200) =>
      res.writeHead(status, { 'content-type': type }).end(body);
    const p = url.pathname;

    if (p === '/robots.txt') return send('User-agent: *\nDisallow: /wp-admin/\n', 'text/plain');
    if (p.startsWith('/img/')) return send(placeholder(decodeURIComponent(p.split('/').pop()!.replace('.svg', ''))), 'image/svg+xml');

    if (p === '/products.json') {
      const page = Number(url.searchParams.get('page') ?? 1);
      const products =
        page > 1
          ? []
          : lstore.map(([id, sku, title, handle, type, price, av]) => ({
              id: Number(id),
              title,
              handle,
              product_type: type,
              tags: [],
              variants: [{ sku, price: `${shift(id, Number(price), day)}.00`, compare_at_price: null, available: av === '1' }],
              images: [{ src: `${base}/img/${sku}.svg` }],
            }));
      return send(JSON.stringify({ products }), 'application/json');
    }

    const kPage = p.match(/^\/teme-lego\/gwp-lego-setovi-kockica\/(?:page\/(\d+)\/)?$/);
    if (kPage) {
      const page = Number(kPage[1] ?? 1);
      const per = 60;
      const rows = kockarium.slice((page - 1) * per, page * per);
      if (!rows.length) return send('', 'text/html', 404);
      const cards = rows.map(([id, sku, title, price, regular, stock, adult, cats, slug]) => {
        const pr = shift(id, Number(price), day);
        const fmt = (n: number) => `${new Intl.NumberFormat('de-DE').format(n)},00&nbsp;RSD`;
        const priceHtml = regular
          ? `<del>${fmt(Number(regular))}</del><ins>${fmt(pr)}</ins>`
          : fmt(pr);
        return `<li class="product type-product post-${id} ${stock === '1' ? 'instock' : 'outofstock'} ${adult === '1' ? 'product_cat-odrasli' : ''}">
<a href="${base}/lego/${slug}" class="woocommerce-LoopProduct-link"><img src="${base}/img/${esc(sku)}.svg" alt=""></a>
<div class="loop-product-categories">${cats.split('^').filter(Boolean).map((c) => `<a href="#" rel="tag">${esc(c)}</a>`).join(', ')}</div>
<h2 class="wc-loop-product-title"><a href="${base}/lego/${slug}">${esc(title)}</a></h2>
<span class="price">${priceHtml}</span>
<a href="?add-to-cart=${id}" data-product_id="${id}" data-product_sku="${esc(sku)}" class="add_to_cart_button">Dodaj u korpu</a></li>`;
      });
      return send(
        `<html><body><p class="woocommerce-result-count">Prikaz ${(page - 1) * per + 1}–${(page - 1) * per + rows.length} od ${kockarium.length} rezultata</p><ul class="products">${cards.join('\n')}</ul></body></html>`,
      );
    }

    if (p === '/brendovi/lego') {
      const page = Number(url.searchParams.get('page') ?? 1);
      const per = 48;
      const nbPages = Math.ceil(ananas.length / per);
      const hits = ananas.slice((page - 1) * per, page * per).map(([id, price, basePrice, stock, qty, seller, title, cat]) => {
        const pr = shift(id, Number(price), day);
        return {
          objectID: id,
          price: pr,
          basePrice: basePrice ? Number(basePrice) : pr,
          onStock: stock === '1',
          available: Number(qty),
          merchant: { displayName: seller },
          product: {
            name: title,
            slug: title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-'),
            brand: 'LEGO',
            categoryNames: ['LEGO kocke', 'Igračke za decu', ...(cat ? [cat] : [])],
            coverImageUrl: `${base}/img/${encodeURIComponent(title.match(/\b\d{5}\b/)?.[0] ?? 'LEGO')}.svg`,
          },
        };
      });
      const data = { prod_merchant_inventories_sr: { results: [{ hits, nbHits: ananas.length, nbPages, page: page - 1 }] } };
      return send(`<html><body><script>window[Symbol.for("InstantSearchInitialResults")] = ${JSON.stringify(data)}</script></body></html>`);
    }
    send('not found', 'text/plain', 404);
  });
  return new Promise<http.Server>((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function main() {
  const args = process.argv.slice(2);
  const log = (m: string) => console.log(m);
  if (args.includes('--reset')) {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    log('baza je obrisana');
  }
  await migrate(log);
  config.CRAWLER_DELAY_MS = 0;

  // three crawls: 21 days ago, 9 days ago, today
  for (const [day, ago] of [
    [1, 21],
    [2, 9],
    [3, 0],
  ] as const) {
    const server = await startFakeShops(day === 3 ? 0 : day);
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    config.LSTORE_BASE_URL = base;
    config.KOCKARIUM_BASE_URL = base;
    config.ANANAS_BASE_URL = base;
    const res = await runCrawl({ log: () => {} });
    log(`preuzimanje (pre ${ago} dana): ${res.map((r) => `${r.shop} ${r.items}/${r.matched}`).join(', ')}`);
    if (ago > 0) {
      // pretend this crawl happened `ago` days ago
      await query(`UPDATE price_history SET recorded_at = recorded_at - make_interval(days => $1) WHERE recorded_at > now() - interval '10 minutes'`, [ago]);
      await query(`UPDATE crawl_runs SET started_at = started_at - make_interval(days => $1), finished_at = finished_at - make_interval(days => $1) WHERE started_at > now() - interval '10 minutes'`, [ago]);
      await query(`UPDATE offers SET first_seen = first_seen - make_interval(days => $1) WHERE first_seen > now() - interval '10 minutes'`, [ago]);
      await query(`UPDATE sets SET created_at = created_at - make_interval(days => $1) WHERE created_at > now() - interval '10 minutes'`, [ago]);
    }
    if (day === 3 && args.includes('--keep-server')) log(`lažne prodavnice ostaju na ${base}`);
    else server.close();
  }
  await computeDeals({ log });

  // Placeholder pictures that work offline: web/public/demo-img/<set>.svg (git-ignored)
  const imgDir = path.resolve(here, '..', '..', 'web', 'public', 'demo-img');
  mkdirSync(imgDir, { recursive: true });
  const sets = await query<{ set_num: string }>('SELECT set_num FROM sets');
  for (const s of sets) writeFileSync(path.join(imgDir, `${s.set_num}.svg`), placeholder(s.set_num));
  await query("UPDATE sets SET image_url = '/demo-img/' || set_num || '.svg'");
  await query("UPDATE offers SET image_url = CASE WHEN set_num IS NULL THEN NULL ELSE '/demo-img/' || set_num || '.svg' END");

  const pw = await hashPassword('demo1234');
  await query(
    `INSERT INTO users (email, name, role, password_hash) VALUES ('demo@kockolov.local', 'Milan', 'admin', $1)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [pw],
  );
  const stats = await query(
    `SELECT (SELECT count(*) FROM sets) AS sets, (SELECT count(*) FROM offers) AS offers,
            (SELECT count(*) FROM offers WHERE set_num IS NULL) AS unmatched, (SELECT count(*) FROM deals) AS deals`,
  );
  log(`gotovo: ${JSON.stringify(stats[0])} — prijava: demo@kockolov.local / demo1234`);
  if (!args.includes('--keep-server')) await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import { readFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';

const fx = (p: string) => readFileSync(path.join(__dirname, 'fixtures', p), 'utf8');

/** One local server that impersonates all three shops using the recorded fixtures. */
export async function startMockShops(overrides: Record<string, () => string | null> = {}) {
  const hits: string[] = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    hits.push(url.pathname + url.search);
    const key = url.pathname + (url.searchParams.get('page') ? `?page=${url.searchParams.get('page')}` : '');
    if (overrides[key]) {
      const body = overrides[key]();
      if (body === null) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html' }).end(body);
      return;
    }
    const send = (body: string, type = 'text/html') => res.writeHead(200, { 'content-type': type }).end(body);
    if (url.pathname === '/robots.txt') return send('User-agent: *\nDisallow: /wp-admin/\nDisallow: /assets/\n', 'text/plain');
    // LEGO Store (Shopify)
    if (url.pathname === '/products.json') {
      return send(url.searchParams.get('page') === '1' ? fx('lstore/products-page1.json') : fx('lstore/products-page2.json'), 'application/json');
    }
    // Kockarium (WooCommerce)
    if (url.pathname === '/teme-lego/gwp-lego-setovi-kockica/') return send(fx('kockarium/page1.html'));
    if (url.pathname === '/teme-lego/gwp-lego-setovi-kockica/page/2/') return send(fx('kockarium/page2.html'));
    // Ananas (marketplace)
    if (url.pathname === '/brendovi/lego') {
      return send(url.searchParams.get('page') === '2' ? fx('ananas/page2.html') : fx('ananas/page1.html'));
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, hits, close: () => new Promise<void>((r) => server.close(() => r())) };
}

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { lstoreDescription, piecesFrom } from '../src/crawler/adapters/lstore.js';
import { injectApp } from '../src/seo/pages.js';
import { renderPage, startSsr } from '../src/seo/ssr.js';

describe('pages drawn on the server', () => {
  it('answers the page renderer through the API, as each visitor, side by side', async () => {
    // a stand-in for web/dist-ssr/entry-server.js: draws the address and what the API said
    const root = mkdtempSync(path.join(os.tmpdir(), 'kockolov-ssr-'));
    mkdirSync(path.join(root, 'dist'));
    mkdirSync(path.join(root, 'dist-ssr'));
    writeFileSync(
      path.join(root, 'dist-ssr', 'entry-server.js'),
      `let f;
       export const setServerFetch = (x) => { f = x; };
       export async function render(url) {
         await new Promise((r) => setTimeout(r, 20));
         const res = await f('/api/echo', {});
         return { html: '<p>' + url + ' ' + (await res.text()) + '</p>', state: { url } };
       }`,
    );
    const app = Fastify();
    app.get('/api/echo', async (req) => `cookie=${req.headers.cookie ?? ''} ip=${req.ip}`);
    expect(await renderPage('/x', {})).toBeNull(); // nothing loaded yet
    expect(await startSsr(app, path.join(root, 'dist'))).toBe(true);
    const [a, b] = await Promise.all([
      renderPage('/set/1', { cookie: 'kl_session=ana', ip: '203.0.113.7' }),
      renderPage('/set/2', { cookie: 'kl_session=bora', ip: '198.51.100.9' }),
    ]);
    expect(a?.html).toBe('<p>/set/1 cookie=kl_session=ana ip=203.0.113.7</p>');
    expect(b?.html).toBe('<p>/set/2 cookie=kl_session=bora ip=198.51.100.9</p>');
    expect(await startSsr(app, path.join(os.tmpdir(), 'nema-ovoga', 'dist'))).toBe(false);
    await app.close();
  });

  it('puts the page and its data into #root, safely', () => {
    const html = '<html><head></head><body>\n    <div id="root"></div>\n  </body></html>';
    const out = injectApp(html, { html: '<h1>Set</h1>', state: { name: '</script><script>alert(1)</script>' } });
    expect(out).toContain('<div id="root" data-ssr="page"><h1>Set</h1></div>');
    expect(out).toContain('<script>window.__KQ__={"name":"\\u003c/script>\\u003cscript>alert(1)\\u003c/script>"}</script>');
    expect(out).not.toContain('</script><script>alert(1)');
  });
});

describe('set details from the LEGO Store', () => {
  it('keeps the Serbian product text and reads the number of pieces', () => {
    const html =
      '<p>Mladi ljubitelji Mario sveta mogu da se trkaju sa Bowserom u ovom setu za igru.<br>Komplet sadrži 850 delova, ' +
      'a donosi mini-figure Mario i Peach.<br>Poklon za decu uzrasta 8+ koji vole igre &amp; avanture.</p>';
    const d = lstoreDescription(html);
    expect(d).toBe(
      'Mladi ljubitelji Mario sveta mogu da se trkaju sa Bowserom u ovom setu za igru.\nKomplet sadrži 850 delova, a donosi mini-figure Mario i Peach.\nPoklon za decu uzrasta 8+ koji vole igre & avanture.',
    );
    expect(piecesFrom(d)).toBe(850);
    expect(piecesFrom('Ovaj model ima 1.234 dela.')).toBe(1234);
    expect(piecesFrom('Komplet sadrži 241 deo.')).toBe(241);
    expect(piecesFrom('Za decu od 2026. godine')).toBeNull();
  });

  it('drops placeholders, app notices and English texts', () => {
    expect(lstoreDescription('<p>...</p>')).toBeNull();
    expect(lstoreDescription('<h2>BOGOS.io</h2><p>Free gift <a href="mailto:x@y">contact</a></p>')).toBeNull();
    expect(
      lstoreDescription('<p>Build two Lunar New Year models and display them together or separately. A gift for ages 8 and up with the Yuan Bao ingots.</p>'),
    ).toBeNull();
    expect(lstoreDescription(null)).toBeNull();
  });
});

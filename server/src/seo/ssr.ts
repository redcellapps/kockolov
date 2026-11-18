import { AsyncLocalStorage } from 'node:async_hooks';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { FastifyInstance } from 'fastify';

/*
 * Pages drawn on the server: the web app's own React code (web/dist-ssr/entry-server.js, built with
 * `vite build --mode ssr`) renders the page into the HTML, so search engines, link previews and slow
 * phones get the whole page without waiting for JavaScript; the browser then takes it over (hydrateRoot).
 * The app asks for its data through the API as usual; here those calls are answered in-process
 * (app.inject) with the visitor's own cookie, so a signed-in visitor gets their own page (currency,
 * watchlist). Without the bundle (development, tests) pages are served as before.
 */

interface SsrModule {
  render(url: string): Promise<{ html: string; state: unknown }>;
  setServerFetch(f: (path: string, init: RequestInit) => Promise<Response>): void;
}

const visitor = new AsyncLocalStorage<{ cookie?: string }>();
let mod: SsrModule | null = null;

/** Loads the renderer next to web/dist, if it was built. Returns whether pages will be drawn on the server. */
export async function startSsr(app: FastifyInstance, webDist: string): Promise<boolean> {
  const file = path.join(webDist, '..', 'dist-ssr', 'entry-server.js');
  if (!existsSync(file)) return false;
  mod = (await import(pathToFileURL(file).href)) as SsrModule;
  mod.setServerFetch(async (p, init) => {
    const r = await app.inject({
      method: (init.method ?? 'GET') as 'GET',
      url: p,
      headers: { cookie: visitor.getStore()?.cookie ?? '', ...(init.body ? { 'content-type': 'application/json' } : {}) },
      ...(init.body ? { payload: String(init.body) } : {}),
    });
    const empty = r.statusCode === 204 || r.statusCode === 304;
    return new Response(empty ? null : r.body, { status: r.statusCode, headers: { 'content-type': String(r.headers['content-type'] ?? 'application/json') } });
  });
  return true;
}

/** The page's HTML and the data it was drawn from, or null (no renderer, an error, or slower than 3 s). */
export async function renderPage(url: string, cookie: string | undefined): Promise<{ html: string; state: unknown } | null> {
  if (!mod) return null;
  const m = mod;
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      visitor.run({ cookie }, () => m.render(url)),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), 3000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

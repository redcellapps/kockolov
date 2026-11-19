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
  render(url: string, until?: number): Promise<{ html: string; state: unknown }>;
  setServerFetch(f: (path: string, init: RequestInit) => Promise<Response>): void;
}

/** who is looking: their cookie (signed in or not), address and browser, for the API calls made for them */
export interface Visitor {
  cookie?: string;
  ip?: string;
  userAgent?: string;
}
const visitor = new AsyncLocalStorage<Visitor & { until: number }>();
let mod: SsrModule | null = null;

/**
 * How long a visitor waits for a drawn page before getting the crawler copy, and how many pages are drawn
 * at once (more visitors than that get the crawler copy too, so a slow database isn't buried under renders).
 */
export const ssrLimits = { ms: 3000, atOnce: 8 };
let running = 0;

/** Loads the renderer next to web/dist, if it was built. Returns whether pages will be drawn on the server. */
export async function startSsr(app: FastifyInstance, webDist: string): Promise<boolean> {
  const file = path.join(webDist, '..', 'dist-ssr', 'entry-server.js');
  if (!existsSync(file)) return false;
  mod = (await import(pathToFileURL(file).href)) as SsrModule;
  mod.setServerFetch(async (p, init) => {
    const v = visitor.getStore();
    // the visitor already got the crawler copy: a page past its time makes no more calls
    if (v && Date.now() > v.until) throw new Error('page out of time');
    const r = await app.inject({
      method: (init.method ?? 'GET') as 'GET',
      url: p,
      // the visitor's own address, so per-person limits and counters (an ad's views) see them, not this server
      ...(v?.ip ? { remoteAddress: v.ip } : {}),
      headers: {
        cookie: v?.cookie ?? '',
        ...(v?.userAgent ? { 'user-agent': v.userAgent } : {}),
        ...(init.body ? { 'content-type': 'application/json' } : {}),
      },
      ...(init.body ? { payload: String(init.body) } : {}),
    });
    const empty = r.statusCode === 204 || r.statusCode === 304;
    return new Response(empty ? null : r.body, { status: r.statusCode, headers: { 'content-type': String(r.headers['content-type'] ?? 'application/json') } });
  });
  return true;
}

/**
 * The page's HTML and the data it was drawn from, or null (no renderer, too many pages being drawn, or
 * slower than ssrLimits.ms). Rejects when the page couldn't be drawn (an error, data that didn't come).
 */
export async function renderPage(url: string, who: Visitor): Promise<{ html: string; state: unknown } | null> {
  if (!mod || running >= ssrLimits.atOnce) return null;
  const until = Date.now() + ssrLimits.ms;
  const work = visitor.run({ ...who, until }, () => mod!.render(url, until));
  // counted until it really ends, not when the visitor stops waiting
  running++;
  const done = () => {
    running--;
  };
  work.then(done, done);
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ssrLimits.ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

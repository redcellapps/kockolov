import { config } from '../config.js';
import { query } from '../db.js';
import { LANDINGS } from './landings.js';

/*
 * IndexNow: after the morning crawl, Bing (and Yandex, Seznam, Naver) are told which pages changed, so they
 * crawl those first. Bing's index also feeds ChatGPT and Copilot search. Google doesn't use IndexNow; it reads
 * the sitemap's dates. Needs INDEXNOW_KEY (any 8–128 letters, digits or dashes); the key file is served at
 * /<key>.txt to prove the site is ours.
 */

const ENDPOINT = 'https://api.indexnow.org/indexnow';
const site = () => config.APP_URL.replace(/\/$/, '');

export const indexNowOn = () => !!config.INDEXNOW_KEY && config.PUBLIC_MODE;

/** The lists every crawl changes: home, deals, Black Friday, sales, themes, gift and age pages */
async function listUrls(): Promise<string[]> {
  const themes = await query<{ slug: string }>(
    `SELECT DISTINCT s.theme_slug AS slug FROM sets s JOIN public_offers o ON o.set_num = s.set_num
      WHERE s.theme_slug IS NOT NULL AND o.active AND o.in_stock ORDER BY 1`,
  );
  return ['/', '/ponude', '/crni-petak', '/akcije', '/teme', ...themes.map((t) => `/tema/${encodeURIComponent(t.slug)}`), ...LANDINGS.map((l) => l.path)];
}

/** Set pages whose prices, stock, offers or details changed since then (all sets in stock without a date) */
async function setUrls(since?: Date): Promise<string[]> {
  const rows = since
    ? await query<{ set_num: string }>(
        `SELECT DISTINCT o.set_num FROM public_offers o JOIN sets s ON s.set_num = o.set_num
          WHERE o.set_num IS NOT NULL AND o.active
            AND (o.first_seen > $1 OR o.price_changed_at > $1 OR s.updated_at > $1
                 OR EXISTS (SELECT 1 FROM price_history ph WHERE ph.offer_id = o.id AND ph.recorded_at > $1))`,
        [since],
      )
    : await query<{ set_num: string }>(
        `SELECT set_num FROM public_offers WHERE set_num IS NOT NULL AND active GROUP BY set_num HAVING bool_or(in_stock)`,
      );
  return rows.map((r) => `/set/${encodeURIComponent(r.set_num)}`);
}

/** Tells the search engines about these pages (paths or full addresses). Returns how many were sent. */
export async function submitIndexNow(paths: string[], log: (m: string) => void = console.log): Promise<number> {
  if (!indexNowOn() || !paths.length) return 0;
  const urls = [...new Set(paths.map((p) => (p.startsWith('http') ? p : `${site()}${p}`)))];
  const host = new URL(site()).host;
  let sent = 0;
  for (let i = 0; i < urls.length; i += 10_000) {
    const urlList = urls.slice(i, i + 10_000);
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host, key: config.INDEXNOW_KEY, keyLocation: `${site()}/${config.INDEXNOW_KEY}.txt`, urlList }),
      signal: AbortSignal.timeout(30_000),
    });
    // 200 and 202 are both "received"; 403 = the key file can't be read, 422 = addresses not on this host
    if (res.status !== 200 && res.status !== 202) throw new Error(`IndexNow: ${res.status} ${(await res.text()).slice(0, 200)}`);
    sent += urlList.length;
  }
  log(`IndexNow: javljeno ${sent} adresa`);
  return sent;
}

/** After a crawl that started at `since`: the lists and the set pages that changed */
export async function submitChanged(since: Date, log?: (m: string) => void): Promise<number> {
  if (!indexNowOn()) return 0;
  return submitIndexNow([...(await listUrls()), ...(await setUrls(since))], log);
}

/** Everything in the sitemap (the first time, or after big changes) */
export async function submitAll(log?: (m: string) => void): Promise<number> {
  if (!indexNowOn()) return 0;
  return submitIndexNow([...(await listUrls()), ...(await setUrls())], log);
}

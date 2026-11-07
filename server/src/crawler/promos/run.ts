import { query } from '../../db.js';
import { PoliteFetcher } from '../../lib/http.js';
import { extractPromos, parseAtomFeed, passagesFromHtml, type PromoCandidate } from './extract.js';
import { upsertCandidate } from './store.js';

export interface PromoSource {
  shopId: string;
  kind: 'page' | 'feed';
  url: string;
  /** shops that sell other things too: only passages that mention LEGO */
  legoOnly?: boolean;
}

/** Where each shop announces promotions. Pages are read as plain text, so a redesign doesn't break the reading. */
export const PROMO_SOURCES: PromoSource[] = [
  { shopId: 'lstore', kind: 'feed', url: 'https://lstore.rs/blogs/vesti.atom' },
  { shopId: 'lstore', kind: 'page', url: 'https://lstore.rs/' },
  { shopId: 'kockarium', kind: 'page', url: 'https://www.kockarium.rs/lego-kocke-akcija/' },
  { shopId: 'kockarium', kind: 'page', url: 'https://www.kockarium.rs/' },
  { shopId: 'dexy', kind: 'page', url: 'https://www.dexy.co.rs/akcije-i-snizenja', legoOnly: true },
  { shopId: 'dexy', kind: 'page', url: 'https://www.dexy.co.rs/lego-kocke', legoOnly: true },
];

/** Blog posts older than this are not read; a promotion worth showing is recent or has its own end date. */
const FEED_MAX_AGE_DAYS = 120;

export interface PromoRunRow {
  source: string;
  found: number;
  added: number;
  changed: number;
  error?: string;
}

type Getter = { get(url: string): Promise<{ status: number; text: string }> };

export async function runPromoCrawl(
  opts: { log?: (m: string) => void; http?: Getter; sources?: PromoSource[]; shops?: string[]; now?: Date } = {},
): Promise<PromoRunRow[]> {
  const log = opts.log ?? (() => undefined);
  const now = opts.now ?? new Date();
  const http: Getter = opts.http ?? new PoliteFetcher({ log });
  const sources = (opts.sources ?? PROMO_SOURCES).filter((s) => !opts.shops?.length || opts.shops.includes(s.shopId));
  const known = new Set((await query<{ id: string }>('SELECT id FROM shops')).map((r) => r.id));
  const themes = await query<{ slug: string; name: string }>('SELECT slug, name FROM themes');
  const rows: PromoRunRow[] = [];

  for (const s of sources) {
    const row: PromoRunRow = { source: s.url, found: 0, added: 0, changed: 0 };
    rows.push(row);
    if (!known.has(s.shopId)) {
      row.error = `nepoznata prodavnica ${s.shopId}`;
      continue;
    }
    try {
      const res = await http.get(s.url);
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      const found: PromoCandidate[] = [];
      if (s.kind === 'feed') {
        const cutoff = now.getTime() - FEED_MAX_AGE_DAYS * 86_400_000;
        for (const e of parseAtomFeed(res.text)) {
          if (e.published && new Date(e.published).getTime() < cutoff) continue;
          found.push(...extractPromos(passagesFromHtml(e.html), { sourceUrl: e.url, titleHint: e.title, themes, now, legoOnly: s.legoOnly }));
        }
      } else {
        found.push(...extractPromos(passagesFromHtml(res.text), { sourceUrl: s.url, themes, now, legoOnly: s.legoOnly }));
      }
      row.found = found.length;
      for (const c of found) {
        const r = await upsertCandidate(s.shopId, c);
        if (r.action === 'new') row.added++;
        if (r.action === 'changed') row.changed++;
      }
      log(`akcije [${s.shopId}] ${s.url}: pronađeno ${row.found}, novih ${row.added}, izmenjenih ${row.changed}`);
    } catch (err) {
      row.error = (err as Error).message;
      log(`akcije [${s.shopId}] ${s.url}: ${row.error}`);
    }
  }
  return rows;
}

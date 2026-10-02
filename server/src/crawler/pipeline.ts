import { one, query, tx } from '../db.js';
import { PoliteFetcher } from '../lib/http.js';
import { cleanTitle } from '../lib/setnum.js';
import { themeFromList } from '../lib/themes.js';
import { adaptersFor } from './adapters/index.js';
import { loadRules, ruleHides } from './hiding.js';
import { buildNameIndex, matchOffer, notASet, type MatchIndex } from './matching.js';
import { refreshSets } from './refresh.js';
import { computeDeals } from '../deals/engine.js';
import { seedReferenceData } from './seed.js';
import type { RawOffer, ShopAdapter } from './types.js';

export interface ShopRunSummary {
  shop: string;
  status: 'ok' | 'failed' | 'suspicious';
  pages: number;
  items: number;
  matched: number;
  newItems: number;
  priceChanges: number;
  deactivated: number;
  error?: string;
  durationMs: number;
}

interface ExistingOffer {
  id: number;
  set_num: string | null;
  match_method: string | null;
  price_rsd: number;
  regular_price_rsd: number | null;
  in_stock: boolean;
  active: boolean;
}

async function loadMatchIndex(): Promise<MatchIndex> {
  const rows = await query<{ set_num: string; names: (string | null)[]; theme_slug: string | null; rrp_rsd: number | null }>(
    `SELECT s.set_num, s.theme_slug, s.rrp_rsd,
            array_remove(array_agg(DISTINCT o.title), NULL) || ARRAY[s.name, s.name_en] AS names
       FROM sets s LEFT JOIN offers o ON o.set_num = s.set_num AND o.shop_id IN ('lstore', 'kockarium')
      GROUP BY s.set_num`,
  );
  return {
    known: new Set(rows.map((r) => r.set_num)),
    names: buildNameIndex(rows),
    sets: new Map(
      rows.map((r) => [r.set_num, { names: r.names.filter((n): n is string => !!n), theme: r.theme_slug, rrp: r.rrp_rsd }]),
    ),
  };
}

function initialSetName(shopId: string, o: RawOffer, setNum: string): string {
  const t = shopId === 'lstore' ? o.title : cleanTitle(o.title.replace(new RegExp(`^${setNum}\\s*[-–:]?\\s*`), ''), setNum);
  return t || `LEGO ${setNum}`;
}

export async function crawlShop(adapter: ShopAdapter, log: (m: string) => void, maxPages = 120): Promise<ShopRunSummary> {
  const shopId = adapter.shop.id;
  const t0 = Date.now();
  const run = (await one<{ id: number; started_at: Date }>(
    'INSERT INTO crawl_runs (shop_id) VALUES ($1) RETURNING id, started_at',
    [shopId],
  ))!;
  const http = new PoliteFetcher({ log: (m) => log(`[${shopId}] ${m}`) });
  const summary: ShopRunSummary = {
    shop: shopId, status: 'ok', pages: 0, items: 0, matched: 0, newItems: 0, priceChanges: 0, deactivated: 0, durationMs: 0,
  };

  try {
    const existing = new Map<string, ExistingOffer>();
    for (const r of await query<ExistingOffer & { external_id: string }>(
      'SELECT id, external_id, set_num, match_method, price_rsd, regular_price_rsd, in_stock, active FROM offers WHERE shop_id = $1',
      [shopId],
    )) existing.set(r.external_id, r);

    const idx = await loadMatchIndex();
    const rules = await loadRules();
    const seenThisRun = new Set<string>();

    for await (const page of adapter.crawl({ http, log: (m) => log(`[${shopId}] ${m}`), maxPages })) {
      summary.pages++;
      const fresh = page.offers.filter((o) => !seenThisRun.has(o.externalId));
      fresh.forEach((o) => seenThisRun.add(o.externalId));
      await tx(async (db) => {
        for (const o of fresh) {
          const prev = existing.get(o.externalId);
          let setNum: string | null = null;
          let method: string | null = null;
          if (prev?.match_method === 'manual') {
            setNum = prev.set_num;
            method = 'manual';
          } else if (prev?.match_method === 'hidden') {
            method = 'hidden'; // the admin hid this offer: it stays hidden
          } else if (rules.some((r) => ruleHides(r, shopId, o.title))) {
            method = 'hidden_rule';
          } else {
            const m = matchOffer(o, idx, { checkPrice: adapter.shop.kind !== 'official' });
            if (m) {
              setNum = m.setNum;
              method = m.method;
            } else if (notASet(o)) {
              method = 'merch'; // bags, used items, single minifigures: not a set, keep out of the review queue
            }
          }
          if (setNum) {
            await db.query(
              `INSERT INTO sets (set_num, name, theme_slug, image_url, age_min)
               VALUES ($1, $2, $3, $4, $5) ON CONFLICT (set_num) DO NOTHING`,
              [setNum, initialSetName(shopId, o, setNum), themeFromList(o.themeRaw), o.imageUrl ?? null, o.ageMin ?? null],
            );
            if (!idx.known.has(setNum)) idx.known.add(setNum);
            summary.matched++;
          }
          const res = await db.query<{ id: number }>(
            `INSERT INTO offers (shop_id, external_id, seller, set_num, match_method, title, url, image_url, price_rsd,
                                 regular_price_rsd, in_stock, stock_qty, theme_raw, age_min, active, last_seen)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,true,now())
             ON CONFLICT (shop_id, external_id) DO UPDATE SET
               seller = EXCLUDED.seller, set_num = EXCLUDED.set_num, match_method = EXCLUDED.match_method,
               title = EXCLUDED.title, url = EXCLUDED.url, image_url = COALESCE(EXCLUDED.image_url, offers.image_url),
               price_rsd = EXCLUDED.price_rsd, regular_price_rsd = EXCLUDED.regular_price_rsd,
               in_stock = EXCLUDED.in_stock, stock_qty = EXCLUDED.stock_qty, theme_raw = EXCLUDED.theme_raw,
               age_min = EXCLUDED.age_min, active = true, last_seen = now(),
               price_changed_at = CASE WHEN offers.price_rsd <> EXCLUDED.price_rsd THEN now() ELSE offers.price_changed_at END
             RETURNING id`,
            [
              shopId, o.externalId, o.seller ?? '', setNum, method, o.title, o.url, o.imageUrl ?? null, o.priceRsd,
              o.regularPriceRsd ?? null, o.inStock, o.stockQty ?? null, o.themeRaw ?? [], o.ageMin ?? null,
            ],
          );
          const offerId = res.rows[0].id;
          const changed =
            !prev ||
            !prev.active ||
            prev.price_rsd !== o.priceRsd ||
            (prev.regular_price_rsd ?? null) !== (o.regularPriceRsd ?? null) ||
            prev.in_stock !== o.inStock;
          if (changed) {
            await db.query(
              'INSERT INTO price_history (offer_id, price_rsd, regular_price_rsd, in_stock) VALUES ($1, $2, $3, $4)',
              [offerId, o.priceRsd, o.regularPriceRsd ?? null, o.inStock],
            );
          }
          if (!prev) summary.newItems++;
          else if (prev.price_rsd !== o.priceRsd) summary.priceChanges++;
        }
      });
      summary.items += fresh.length;
    }

    // Sanity check before touching anything we did NOT see in this run
    const prevOk = await one<{ items: number; started_at: Date }>(
      `SELECT items, started_at FROM crawl_runs WHERE shop_id = $1 AND status = 'ok' AND id <> $2
        ORDER BY started_at DESC LIMIT 1`,
      [shopId, run.id],
    );
    if (summary.items === 0) {
      summary.status = 'failed';
      summary.error = 'Nijedan proizvod nije pronađen — verovatno je promenjen izgled sajta.';
    } else if (prevOk && prevOk.items > 20 && summary.items < prevOk.items * 0.5) {
      summary.status = 'suspicious';
      summary.error = `Pronađeno ${summary.items} proizvoda, prethodno ${prevOk.items}. Podaci nisu deaktivirani.`;
    } else {
      // Missing today -> treat as unavailable right away
      const gone = await query<{ id: number; price_rsd: number; regular_price_rsd: number | null }>(
        `UPDATE offers SET in_stock = false
          WHERE shop_id = $1 AND active AND in_stock AND last_seen < $2
        RETURNING id, price_rsd, regular_price_rsd`,
        [shopId, run.started_at],
      );
      for (const g of gone) {
        await query('INSERT INTO price_history (offer_id, price_rsd, regular_price_rsd, in_stock) VALUES ($1,$2,$3,false)', [
          g.id, g.price_rsd, g.regular_price_rsd,
        ]);
      }
      // Missing in two consecutive good runs -> hide completely
      if (prevOk) {
        const deact = await query('UPDATE offers SET active = false WHERE shop_id = $1 AND active AND last_seen < $2 RETURNING id', [
          shopId, prevOk.started_at,
        ]);
        summary.deactivated = deact.length;
      }
    }
  } catch (err) {
    summary.status = 'failed';
    summary.error = (err as Error).message;
    log(`[${shopId}] FAILED: ${(err as Error).stack ?? err}`);
  }

  summary.durationMs = Date.now() - t0;
  await query(
    `UPDATE crawl_runs SET finished_at = now(), status = $2, pages = $3, items = $4, matched = $5, new_items = $6,
            price_changes = $7, deactivated = $8, error = $9 WHERE id = $1`,
    [run.id, summary.status, summary.pages, summary.items, summary.matched, summary.newItems, summary.priceChanges,
      summary.deactivated, summary.error ?? null],
  );
  log(
    `[${shopId}] ${summary.status}: ${summary.items} ponuda (${summary.matched} povezano sa setom), ` +
      `${summary.newItems} novih, ${summary.priceChanges} promena cene, ${summary.pages} str., ${(summary.durationMs / 1000).toFixed(0)}s`,
  );
  return summary;
}

let running = false;
export function isCrawlRunning() {
  return running;
}

/** Crawl the given shops (default: all enabled), then rebuild set data. */
export async function runCrawl(opts: { shops?: string[]; log?: (m: string) => void } = {}): Promise<ShopRunSummary[]> {
  const log = opts.log ?? ((m: string) => console.log(`${new Date().toISOString()} ${m}`));
  if (running) throw new Error('Crawl is already running');
  running = true;
  try {
    await seedReferenceData();
    const enabled = new Set((await query<{ id: string }>('SELECT id FROM shops WHERE enabled')).map((r) => r.id));
    const adapters = adaptersFor(opts.shops).filter((a) => enabled.has(a.shop.id));
    const out: ShopRunSummary[] = [];
    // Official store first: it establishes names + reference prices used for matching the others
    for (const a of adapters) out.push(await crawlShop(a, log));
    await refreshSets(log);
    await computeDeals({ log });
    return out;
  } finally {
    running = false;
  }
}


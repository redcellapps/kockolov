import { config } from '../config.js';
import { one, query } from '../db.js';
import { PoliteFetcher, RobotsDisallowed } from '../lib/http.js';

/*
 * Box barcodes (EAN), so the app can open a set by scanning its box. The LEGO Store's listing
 * (products.json) has no barcode, but each product's own JSON (/products/<handle>.json) does.
 * A few hundred are read after each crawl, politely; a product is asked again only after 30 days.
 */

/** The barcode in a Shopify product JSON (first variant that has 8–14 digits), or null. */
export function eanFromProductJson(text: string): string | null {
  try {
    const p = (JSON.parse(text) as { product?: { variants?: { barcode?: string | null }[] } }).product;
    for (const v of p?.variants ?? []) {
      const code = (v.barcode ?? '').replace(/\s/g, '');
      if (/^\d{8,14}$/.test(code)) return code;
    }
  } catch {
    /* not JSON */
  }
  return null;
}

export async function fillEans(opts: { log?: (m: string) => void; max?: number; http?: PoliteFetcher } = {}) {
  const log = opts.log ?? (() => {});
  const max = opts.max ?? config.EAN_PER_RUN;
  const out = { checked: 0, found: 0 };
  if (max <= 0) return out;
  const rows = await query<{ id: number; url: string }>(
    `SELECT id, url FROM offers
      WHERE shop_id = 'lstore' AND active AND set_num IS NOT NULL AND ean IS NULL
        AND (ean_checked_at IS NULL OR ean_checked_at < now() - interval '30 days')
      ORDER BY in_stock DESC, id LIMIT $1`,
    [max],
  );
  const http = opts.http ?? new PoliteFetcher({ log: (m) => log(`[ean] ${m}`) });
  for (const r of rows) {
    const url = `${r.url.replace(/[?#].*$/, '').replace(/\/$/, '')}.json`;
    try {
      const res = await http.get(url, { allow404: true });
      const ean = res.status === 200 ? eanFromProductJson(res.text) : null;
      await query('UPDATE offers SET ean = $2, ean_checked_at = now() WHERE id = $1', [r.id, ean]);
      out.checked++;
      if (ean) out.found++;
    } catch (err) {
      if (err instanceof RobotsDisallowed) {
        log('[ean] robots.txt ne dozvoljava stranice proizvoda; preskačem');
        break;
      }
      log(`[ean] ${url}: ${(err as Error).message}`);
    }
  }
  if (rows.length) log(`[ean] provereno ${out.checked} proizvoda, pronađeno ${out.found} bar-kodova`);
  return out;
}

/**
 * The set behind a scanned code: a box barcode (EAN-13, or UPC-A, which is the same number without
 * its leading 0), or a set number typed or read from the box.
 */
export async function setForCode(raw: string): Promise<{ set_num: string; by: 'ean' | 'number' } | null> {
  const code = raw.replace(/\s/g, '');
  if (/^\d{8,14}$/.test(code)) {
    const forms = [code, code.length === 12 ? `0${code}` : null, code.length === 13 && code.startsWith('0') ? code.slice(1) : null].filter(
      (c): c is string => !!c,
    );
    const r = await one<{ set_num: string }>(
      `SELECT set_num FROM offers WHERE ean = ANY($1::text[]) AND set_num IS NOT NULL
        GROUP BY set_num ORDER BY count(*) DESC LIMIT 1`,
      [forms],
    );
    if (r) return { set_num: r.set_num, by: 'ean' };
  }
  if (/^\d{3,7}(-\d{1,2})?$/.test(code)) {
    const s = await one<{ set_num: string }>('SELECT set_num FROM sets WHERE set_num = $1', [code]);
    if (s) return { set_num: s.set_num, by: 'number' };
  }
  return null;
}

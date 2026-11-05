import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from '../db.js';
import { themeFromRaw } from '../lib/themes.js';
import { buildNameIndex, type KnownSet, type KpContext } from './classify.js';

/*
 * Every LEGO set ever made (Rebrickable's free data, the same file the classifieds use:
 * web/public/lego-catalog.json, made with web/scripts/build-catalog.mjs). KP is full of retired
 * sets that no shop sells any more, so a number is "known" when it is in our sets or here.
 */

/** [name, year, pieces, theme, subtheme] */
type Row = [string, number, number, string, string | null];

export interface CatalogSet {
  name: string;
  year: number;
  pieces: number;
  theme: string;
  subtheme: string | null;
}

/** web/public in development, web/dist (Vite copies public/ there) in the Docker image */
export function catalogFile(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(here, '..', '..', '..');
  const candidates = [process.env.LEGO_CATALOG_FILE, path.join(root, 'web', 'public', 'lego-catalog.json'), path.join(root, 'web', 'dist', 'lego-catalog.json')];
  return candidates.find((f): f is string => !!f && existsSync(f)) ?? null;
}

export function loadCatalog(file = catalogFile()): Map<string, CatalogSet> {
  if (!file) return new Map();
  const data = JSON.parse(readFileSync(file, 'utf8')) as Record<string, Row>;
  return new Map(Object.entries(data).map(([num, [name, year, pieces, theme, subtheme]]) => [num, { name, year, pieces, theme, subtheme }]));
}

/** Catalog themes that are not building sets (Rebrickable's names) */
const NOT_SETS = /^(collectible minifigures|minifigures|gear|books|promotional|dimensions|games|power functions|key chains|magnets|bulk bricks|service packs|supplemental|video games|clikits|storage|watches|clocks|stationery|pens)$/i;

/** Our own sets: every name our shops give them (Serbian and English), the theme and the LEGO Store's regular price */
export type OurSets = Map<string, { names: string[]; theme: string | null; rrp: number | null }>;

export async function ourSetsFromDb(): Promise<OurSets> {
  const rows = await query<{ set_num: string; name: string; name_en: string | null; theme_slug: string | null; rrp_rsd: number | null; titles: string[] }>(
    `SELECT s.set_num, s.name, s.name_en, s.theme_slug, s.rrp_rsd,
            coalesce(array_agg(DISTINCT o.title) FILTER (WHERE o.title IS NOT NULL), '{}') AS titles
       FROM sets s LEFT JOIN offers o ON o.set_num = s.set_num AND o.active
      GROUP BY s.set_num`,
  );
  return new Map(
    rows.map((r) => [r.set_num, { names: [r.name, r.name_en, ...r.titles].filter((n): n is string => !!n), theme: r.theme_slug, rrp: r.rrp_rsd }]),
  );
}

/**
 * The same from a CSV export of the live database (set_num,name,theme,rrp_rsd,titles with titles joined
 * by " || "), for a trial report away from the server.
 */
export function ourSetsFromCsv(file: string): OurSets {
  const out: OurSets = new Map();
  const [head, ...rows] = parseCsv(readFileSync(file, 'utf8'));
  const col = (n: string) => head.indexOf(n);
  for (const r of rows) {
    const num = r[col('set_num')];
    if (!num) continue;
    const titles = (r[col('titles')] ?? '').split(' || ').filter(Boolean);
    const rrp = Number(r[col('rrp_rsd')]);
    out.set(num, { names: [r[col('name')], ...titles].filter(Boolean), theme: r[col('theme')] || null, rrp: rrp > 0 ? rrp : null });
  }
  return out;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') row.push(cell), (cell = '');
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell), rows.push(row), (row = []), (cell = '');
    } else cell += c;
  }
  if (cell || row.length) row.push(cell), rows.push(row);
  return rows;
}

const isNotASet = (c: CatalogSet) => NOT_SETS.test(c.theme) || NOT_SETS.test(c.subtheme ?? '');

/** What a set number means: our own sets first (Serbian names, LEGO Store price), then the catalog */
export function knownSetsFrom(catalog: Map<string, CatalogSet>, ours: OurSets): (num: string) => KnownSet | null {
  return (num) => {
    const o = ours.get(num);
    const cat = catalog.get(num);
    if (!o && !cat) return null;
    const names = [...(o?.names ?? []), ...(cat ? [cat.name] : [])];
    const theme = o?.theme ?? (cat ? (themeFromRaw(cat.subtheme ?? '') ?? themeFromRaw(cat.theme)) : null);
    return { names, theme, rrp: o?.rrp ?? null, notASet: !o && !!cat && isNotASet(cat) };
  };
}

export async function knownSets(catalog = loadCatalog()): Promise<(num: string) => KnownSet | null> {
  return knownSetsFrom(catalog, await ourSetsFromDb());
}

/** Everything classifyAd needs: what each number is, the names of single sets, and the euro rate */
export async function kpContext(catalog = loadCatalog(), eurRate: number, ours?: OurSets): Promise<KpContext> {
  const our = ours ?? (await ourSetsFromDb());
  const rows = new Map<string, string[]>();
  for (const [num, o] of our) rows.set(num, [...o.names]);
  for (const [num, c] of catalog) if (!isNotASet(c)) rows.set(num, [...(rows.get(num) ?? []), c.name]);
  const names = buildNameIndex([...rows].map(([num, n]) => ({ num, names: n })));
  return { known: knownSetsFrom(catalog, our), names, eurRate };
}

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadMatchIndex } from '../crawler/pipeline.js';
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

/** What a set number means: our own sets first (Serbian names, LEGO Store price), then the catalog */
export async function knownSets(catalog = loadCatalog()): Promise<(num: string) => KnownSet | null> {
  const idx = await loadMatchIndex();
  return (num) => {
    const ours = idx.sets?.get(num);
    const cat = catalog.get(num);
    if (!ours && !cat) return null;
    const names = [...(ours?.names ?? []), ...(cat ? [cat.name] : [])];
    const theme = ours?.theme ?? (cat ? (themeFromRaw(cat.subtheme ?? '') ?? themeFromRaw(cat.theme)) : null);
    const notASet = !ours && !!cat && (NOT_SETS.test(cat.theme) || NOT_SETS.test(cat.subtheme ?? ''));
    return { names, theme, rrp: ours?.rrp ?? null, notASet };
  };
}

/** Everything classifyAd needs: what each number is, the names of single sets, and the euro rate */
export async function kpContext(catalog = loadCatalog(), eurRate: number): Promise<KpContext> {
  const known = await knownSets(catalog);
  const idx = await loadMatchIndex();
  const rows = new Map<string, string[]>();
  for (const [num, facts] of idx.sets ?? []) rows.set(num, [...facts.names]);
  for (const [num, c] of catalog) {
    if (NOT_SETS.test(c.theme) || NOT_SETS.test(c.subtheme ?? '')) continue;
    rows.set(num, [...(rows.get(num) ?? []), c.name]);
  }
  const names = buildNameIndex([...rows].map(([num, names]) => ({ num, names })));
  return { known, names, eurRate };
}

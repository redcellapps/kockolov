import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { one, query } from '../db.js';
import { normalizeText } from './normalize.js';
import { themeFromList } from './themes.js';

/*
 * Every LEGO set ever made (web/public/lego-catalog.json, built by web/scripts/build-catalog.mjs from
 * Rebrickable's free CSVs). A set no shop has ever sold still gets its page: name, picture, theme, year and
 * pieces from here, and "not in stock anywhere". The set is added to `sets` the first time its page is
 * opened, so it can be watched like any other; once a shop sells it, the crawl fills in the rest.
 */

type Entry = [name: string, year: number, pieces: number, theme: string, subtheme: string | null];
let catalog: Map<string, Entry> | null = null;

function load(): Map<string, Entry> {
  if (catalog) return catalog;
  const here = path.dirname(fileURLToPath(import.meta.url));
  // server/dist/lib or server/src/lib -> web/dist (built) or web/public (development, tests)
  const web = path.resolve(here, '..', '..', '..', 'web');
  const file = [path.join(web, 'dist', 'lego-catalog.json'), path.join(web, 'public', 'lego-catalog.json')].find((f) => existsSync(f));
  try {
    catalog = new Map(file ? Object.entries(JSON.parse(readFileSync(file, 'utf8')) as Record<string, Entry>) : []);
  } catch {
    catalog = new Map();
  }
  return catalog;
}

/** Rebrickable's picture of the set (the main version, "-1") */
export const catalogImage = (setNum: string) => `https://cdn.rebrickable.com/media/sets/${setNum}-1.jpg`;

/** The set as the catalog knows it, or null */
export function catalogSet(setNum: string) {
  const e = load().get(setNum);
  if (!e) return null;
  const [name, year, pieces, theme, subtheme] = e;
  return { name, year: year || null, pieces: pieces || null, theme, subtheme };
}

/**
 * Makes sure a set from the catalog has its row in `sets`. Returns whether the set exists now (it was
 * there already, or the catalog knew it).
 */
export async function ensureCatalogSet(setNum: string): Promise<boolean> {
  if (!/^\d{3,7}$/.test(setNum)) return !!(await one('SELECT 1 FROM sets WHERE set_num = $1', [setNum]));
  if (await one('SELECT 1 FROM sets WHERE set_num = $1', [setNum])) return true;
  const c = catalogSet(setNum);
  if (!c) return false;
  await query(
    `INSERT INTO sets (set_num, name, name_en, theme_slug, image_url, year, pieces, search_text)
     VALUES ($1, $2, $2, $3, $4, $5, $6, $7) ON CONFLICT (set_num) DO NOTHING`,
    [
      setNum,
      c.name,
      themeFromList([c.subtheme ?? '', c.theme].filter(Boolean)),
      catalogImage(setNum),
      c.year,
      c.pieces,
      [setNum, normalizeText(c.name)].join(' | '),
    ],
  );
  return true;
}

import { query, tx } from '../db.js';
import { normalizeText } from '../lib/normalize.js';
import { cleanTitle } from '../lib/setnum.js';
import { refineSuperHeroes, THEME_BY_SLUG, themeFromList } from '../lib/themes.js';

interface OfferRow {
  set_num: string;
  shop_id: string;
  title: string;
  image_url: string | null;
  price_rsd: number;
  in_stock: boolean;
  theme_raw: string[];
  age_min: number | null;
}

interface SetRow {
  set_num: string;
  name: string;
  name_en: string | null;
  theme_slug: string | null;
  theme_locked: boolean;
  image_url: string | null;
  age_min: number | null;
  rrp_rsd: number | null;
  search_text: string;
}

// Which shop's data we trust most for each field
const NAME_ORDER = ['lstore', 'kockarium', 'ananas'];
const THEME_ORDER = ['kockarium', 'ananas', 'lstore'];
const IMAGE_ORDER = ['lstore', 'kockarium', 'ananas'];

function byShop(offers: OfferRow[], order: string[]): OfferRow[] {
  const rank = (s: string) => {
    const i = order.indexOf(s);
    return i < 0 ? order.length : i;
  };
  return [...offers].sort((a, b) => rank(a.shop_id) - rank(b.shop_id) || Number(b.in_stock) - Number(a.in_stock));
}

export function deriveSet(set: SetRow, offers: OfferRow[]): Partial<SetRow> {
  const out: Partial<SetRow> = {};
  if (!offers.length) return out;

  // Name: official Serbian name from the LEGO Store, else Kockarium, else cleaned marketplace title
  const top = byShop(offers, NAME_ORDER)[0];
  let name = top.title;
  if (top.shop_id === 'kockarium') name = name.replace(new RegExp(`^${set.set_num}\\s*[-–:]?\\s*`), '');
  if (top.shop_id === 'ananas') name = cleanTitle(name, set.set_num);
  name = name.trim() || set.name;
  if (name !== set.name) out.name = name;

  // Theme
  if (!set.theme_locked) {
    let theme: string | null = null;
    let generic: string | null = null;
    for (const o of byShop(offers, THEME_ORDER)) {
      const t = themeFromList(o.theme_raw);
      if (!t) continue;
      if (t === 'super-heroes') {
        generic ??= t;
        continue;
      }
      theme = t;
      break;
    }
    if (!theme && generic) {
      theme = offers.map((o) => refineSuperHeroes(o.title)).find(Boolean) ?? refineSuperHeroes(name) ?? generic;
    }
    if (theme && theme !== set.theme_slug) out.theme_slug = theme;
  }

  // Image
  const img = byShop(offers.filter((o) => o.image_url), IMAGE_ORDER)[0]?.image_url ?? null;
  if (img && img !== set.image_url) out.image_url = img;

  // Reference price = LEGO Store price (even when out of stock there)
  const lstore = offers.filter((o) => o.shop_id === 'lstore').sort((a, b) => Number(b.in_stock) - Number(a.in_stock))[0];
  const rrp = lstore?.price_rsd ?? null;
  if (rrp !== set.rrp_rsd) out.rrp_rsd = rrp;

  // Age: lowest stated
  const ages = offers.map((o) => o.age_min).filter((a): a is number => a !== null && a > 0);
  const age = ages.length ? Math.min(...ages) : set.age_min;
  if (age !== set.age_min) out.age_min = age;

  // Search text: number, every name we know, theme names in both languages
  const themeSlug = out.theme_slug ?? set.theme_slug;
  const theme = themeSlug ? THEME_BY_SLUG.get(themeSlug) : undefined;
  const parts = new Set<string>([
    set.set_num,
    normalizeText(name),
    normalizeText(set.name_en),
    ...offers.map((o) => normalizeText(cleanTitle(o.title, set.set_num))),
    theme ? normalizeText(theme.name) : '',
    ...(theme?.search ?? []).map(normalizeText),
  ]);
  const searchText = [...parts].filter(Boolean).join(' | ');
  if (searchText !== set.search_text) out.search_text = searchText;
  return out;
}

/** Recompute name, theme, image, reference price and search text for every set. */
export async function refreshSets(log: (m: string) => void = console.log): Promise<number> {
  const sets = await query<SetRow>(
    'SELECT set_num, name, name_en, theme_slug, theme_locked, image_url, age_min, rrp_rsd, search_text FROM sets',
  );
  const offers = await query<OfferRow>(
    `SELECT set_num, shop_id, title, image_url, price_rsd, in_stock, theme_raw, age_min
       FROM offers WHERE active AND set_num IS NOT NULL`,
  );
  const bySet = new Map<string, OfferRow[]>();
  for (const o of offers) {
    if (!bySet.has(o.set_num)) bySet.set(o.set_num, []);
    bySet.get(o.set_num)!.push(o);
  }
  let updated = 0;
  await tx(async (db) => {
    for (const s of sets) {
      const patch = deriveSet(s, bySet.get(s.set_num) ?? []);
      const keys = Object.keys(patch) as (keyof SetRow)[];
      if (!keys.length) continue;
      const assigns = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
      await db.query(`UPDATE sets SET ${assigns}, updated_at = now() WHERE set_num = $1`, [
        s.set_num,
        ...keys.map((k) => patch[k]),
      ]);
      updated++;
    }
  });
  log(`refresh: ${updated} od ${sets.length} setova ažurirano`);
  return updated;
}

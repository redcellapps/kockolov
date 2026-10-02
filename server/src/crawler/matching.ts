import { normalizeText } from '../lib/normalize.js';
import { cleanTitle, setNumFromSku, setNumFromTitle } from '../lib/setnum.js';
import { THEMES, themeFromRaw } from '../lib/themes.js';
import type { RawOffer } from './types.js';

// Things sold under the LEGO brand that are not building sets
const MERCH = [
  'kutija za odlaganje', 'kutije za odlaganje', 'kutija za uzinu', 'mala kutija', 'torba', 'ranac', 'rancevi', 'privezak',
  'flasica', 'flasa', 'termos', 'lampa', 'budilnik', 'rucni sat', 'majica', 'duks', 'jakna', 'pantalone', 'kapa ',
  'carape', 'pidzama', 'solja', 'sveska', 'pernica', 'olovk', 'magnet', 'knjiga', 'slagalica', 'puzzle', 'kofer',
  'novcanik', 'kuke', 'polica', 'podloga za mis', 'narukvica', 'peskir', 'posteljina', 'jastuk', 'rucnik', 'kisobran',
  'set za pisanje', 'drzac', 'kutija za olovke', 'uskladistenje', 'rashladna torba', 'kesa',
  // seen on Ananas (Sept 2026): storage heads/drawers, lunch sets, bottles, stationery
  'casa ', 'casa sa', 'glava za odlaganje', 'glave za odlaganje', 'set za uzinu', 'markeri', 'gel olovke', 'boca',
  'fioka', 'stona fioka', 'stonih fioka', 'ram za slike', 'dnevnik', 'kutija za razvrstavanje', 'vreca', 'drustvena igra',
  'kutija za baterije', 'kuka', 'kuke za kacenje',
  // seen on the members-only shops (Oct 2026)
  'narukvice', 'privesci', 'pernice', 'rancic', 'lampica', 'svetleca cigla', 'baterijska lampa',
  // used items and bulk bricks are not comparable offers for a set
  'polovn', 'polovan', 'koriscen',
];

export function isMerch(title: string): boolean {
  const n = ` ${normalizeText(title)} `;
  return MERCH.some((w) => n.includes(` ${w}`));
}

/** BrickLink-style code of a single minifigure as a shop SKU: sw0360, frnd0660, col05-9, colspi-9 */
export function isMinifigCode(sku: string | null | undefined): boolean {
  return /^[a-z]{2,6}(?:\d{2,4}[a-z]?(?:-\d{1,2})?|-\d{1,2})$/i.test(sku?.trim() ?? '');
}

/** Sold under the LEGO brand but not a set: merchandise, used items, single minifigures */
export function notASet(o: Pick<RawOffer, 'title' | 'sku'>): boolean {
  return isMerch(o.title) || isMinifigCode(o.sku);
}

export interface MatchResult {
  setNum: string;
  method: 'sku' | 'title' | 'name';
}

export interface SetFacts {
  /** the set's names (LEGO Store, Kockarium titles, name in the catalogue) */
  names: string[];
  theme: string | null;
  /** LEGO Store price */
  rrp: number | null;
}

export interface MatchIndex {
  known: Set<string>;
  /** normalized set name -> set number (only unambiguous, reasonably long names) */
  names: Map<string, string>;
  /** per set number, to check a guessed number and a price against what we know */
  sets?: Map<string, SetFacts>;
}

// themes the shops and the LEGO Store file differently ("Super Heroes" vs Marvel, Botanicals under Icons)
const THEME_FAMILIES = [
  ['marvel', 'dc', 'super-heroes'],
  ['icons', 'botanicals', 'creator', 'iconic'],
];
const sameFamily = (a: string, b: string) => a === b || THEME_FAMILIES.some((f) => f.includes(a) && f.includes(b));

const THEME_WORDS = new Set(THEMES.flatMap((t) => t.match.flatMap((m) => m.split(' '))));
const FILLER = new Set(['lego', 'sa', 'za', 'od', 'the', 'and', 'with', 'set', 'kocke', 'kocka']);

/** Words that say what a set is, without brand, theme or filler words */
function nameWords(s: string): Set<string> {
  return new Set(
    normalizeText(s)
      .split(' ')
      .filter((w) => w.length >= 3 && !/^\d+$/.test(w) && !FILLER.has(w) && !THEME_WORDS.has(w)),
  );
}

/**
 * A set number guessed from an image name is trusted unless the title clearly describes another
 * set: not one word in common with any of the set's names, and a different theme. (Pertini named
 * the picture of "Star Wars Pasaana potera" with an old internal code that is now LEGO set 21358.)
 */
export function guessFits(title: string, facts: SetFacts | undefined): boolean {
  if (!facts) return false; // a set we don't know: can't check, so don't invent it
  const words = nameWords(title);
  if (facts.names.some((n) => [...nameWords(n)].some((w) => words.has(w)))) return true;
  const theme = themeFromRaw(title);
  return !theme || !facts.theme || sameFamily(theme, facts.theme);
}

/**
 * A price far from the LEGO Store price usually means the offer was linked to the wrong set
 * (a 7.799 RSD Star Wars set shown as a 21.999 RSD set at −65%). Such offers wait in the admin's
 * review list instead.
 */
export function plausiblePrice(price: number, rrp: number | null | undefined): boolean {
  if (!rrp || rrp <= 0) return true;
  const ratio = price / rrp;
  return ratio >= 0.4 && ratio <= 3;
}

export function buildNameIndex(rows: { set_num: string; names: (string | null)[] }[]): Map<string, string> {
  const map = new Map<string, string>();
  const dup = new Set<string>();
  for (const r of rows) {
    for (const raw of r.names) {
      const n = normalizeText(cleanTitle(raw ?? '', r.set_num));
      if (n.length < 10 || n.split(' ').length < 2) continue;
      if (map.has(n) && map.get(n) !== r.set_num) dup.add(n);
      else map.set(n, r.set_num);
    }
  }
  for (const d of dup) map.delete(d);
  return map;
}

/**
 * Links an offer to a set number. With checkPrice (every shop except the LEGO Store itself) a
 * match whose price is implausible next to the LEGO Store price is dropped.
 */
export function matchOffer(offer: RawOffer, idx: MatchIndex, opts: { checkPrice?: boolean } = {}): MatchResult | null {
  const m = matchBy(offer, idx);
  if (m && opts.checkPrice && !plausiblePrice(offer.priceRsd, idx.sets?.get(m.setNum)?.rrp)) return null;
  return m;
}

function matchBy(offer: RawOffer, idx: MatchIndex): MatchResult | null {
  const fromSku = setNumFromSku(offer.sku);
  if (fromSku) return { setNum: fromSku, method: 'sku' };
  if (offer.sku) return null; // shop gave a non-set SKU (keychains, clothing...)
  if (isMerch(offer.title)) return null;

  const guess = setNumFromSku(offer.skuGuess);
  if (guess && guessFits(offer.title, idx.sets?.get(guess))) return { setNum: guess, method: 'sku' };

  const fromTitle = setNumFromTitle(offer.title, (n) => idx.known.has(n));
  if (fromTitle && (fromTitle.length === 5 || idx.known.has(fromTitle))) {
    return { setNum: fromTitle, method: 'title' };
  }

  // No number in the title: look for a known set name inside it
  // ("LEGO Art Most Kloda Monea, Uzrast 18+" -> "Most Kloda Monea")
  const cleaned = ` ${normalizeText(cleanTitle(offer.title))} `;
  let hit: string | null = null;
  for (const [name, num] of idx.names) {
    if (cleaned.includes(` ${name} `)) {
      if (hit && hit !== num) return null; // ambiguous
      hit = num;
    }
  }
  return hit ? { setNum: hit, method: 'name' } : null;
}

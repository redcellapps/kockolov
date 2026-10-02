import { normalizeText } from '../lib/normalize.js';
import { cleanTitle, setNumFromSku, setNumFromTitle } from '../lib/setnum.js';
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
];

export function isMerch(title: string): boolean {
  const n = ` ${normalizeText(title)} `;
  return MERCH.some((w) => n.includes(` ${w}`));
}

export interface MatchResult {
  setNum: string;
  method: 'sku' | 'title' | 'name';
}

export interface MatchIndex {
  known: Set<string>;
  /** normalized set name -> set number (only unambiguous, reasonably long names) */
  names: Map<string, string>;
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

export function matchOffer(offer: RawOffer, idx: MatchIndex): MatchResult | null {
  const fromSku = setNumFromSku(offer.sku);
  if (fromSku) return { setNum: fromSku, method: 'sku' };
  if (offer.sku) return null; // shop gave a non-set SKU (keychains, clothing...)
  if (isMerch(offer.title)) return null;

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

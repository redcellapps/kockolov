import { hasWord, isMerchandise, nameWords, sameFamily } from '../crawler/matching.js';
import { normalizeText } from '../lib/normalize.js';
import { themeFromRaw } from '../lib/themes.js';

/*
 * KupujemProdajem ads: which ones are one real LEGO set we can show next to the shops.
 *
 * Only ads we are sure about are shown: exactly one known set number (our sets or the catalog of
 * every LEGO set), nothing that says the ad is about something else, and a believable price.
 * Doubtful ones wait for the admin; the rest are skipped with a reason, so the report can show
 * why each ad went where it went.
 */

/** The condition filter on KP's search ("Oštećeno ili neispravno" is never shown) */
export type KpCondition = 'novo' | 'nekorisceno' | 'korisceno' | 'osteceno';

export interface KpAd {
  id: string;
  title: string;
  /** the start of the description shown in the search results */
  snippet: string;
  /** "23 €", "1.200 din", "Kontakt" (read only when the amount and currency are not given) */
  priceText: string;
  priceAmount?: number | null;
  currency?: 'RSD' | 'EUR' | null;
  condition: KpCondition | null;
  /** "sell" (Prodajem) or "buy" (Kupujem) */
  type?: string;
}

/** What we know about a set number: from our own sets (Serbian names, LEGO Store price) and/or the catalog */
export interface KnownSet {
  names: string[];
  /** our theme slug, when known */
  theme: string | null;
  /** the LEGO Store's regular price; null for sets it doesn't sell (retired ones) */
  rrp: number | null;
  /** the catalog files it under minifigures, gear, books, bulk bricks... (see catalog.ts) */
  notASet?: boolean;
}

export interface KpContext {
  known: (num: string) => KnownSet | null;
  /** RSD per EUR (NBS middle rate) */
  eurRate: number;
}

export type SkipReason =
  | 'wanted' // "Kupujem", "Tražim", "Menjam"
  | 'not_lego' // copies, "kompatibilno sa lego"
  | 'bulk' // bricks by the kilo, mixes
  | 'promo'
  | 'not_a_set' // games, minifigures, instructions, empty boxes, shelves, lights, merchandise
  | 'damaged'
  | 'no_price' // "Kontakt", "Dogovor"
  | 'no_number' // no known set number anywhere
  | 'multi'; // several sets in one ad

export type ReviewReason =
  | 'name' // the title points to another theme than the set's
  | 'price' // far from the LEGO Store price, or not believable
  | 'more_numbers' // one set in the title, other set numbers in the description
  | 'number_in_text'; // the number is only in the description

export type KpDecision =
  | { kind: 'show'; setNum: string; priceRsd: number; price: KpPrice }
  | { kind: 'review'; setNum: string; priceRsd: number; price: KpPrice; why: ReviewReason }
  | { kind: 'skip'; why: SkipReason; setNums?: string[] };

export interface KpPrice {
  amount: number;
  currency: 'RSD' | 'EUR';
}

// ---- words (normalized: lowercase, no diacritics) ----

const WANTED = ['kupujem', 'trazim', 'menjam', 'zamena', 'potrebn'];
/** in the title: anything that says copy; in the description only the clear ones ("bez replika" is a good sign) */
const NOT_LEGO_TEXT = ['kompatibil', 'compatible', 'lepin', 'tipa lego', 'kao lego', 'nije original', 'nisu original', 'lego like'];
const NOT_LEGO = [
  'compatible',
  'kompatibil', 'lepin', 'sluban', 'cobi', 'mega bloks', 'megabloks', 'tipa lego', 'kao lego', 'slicno lego',
  'slicne lego', 'lego like', 'nije original', 'nisu original', 'nije lego', 'nisu lego', 'kopija',
  'replika', 'fake', 'alternativ', 'imitacij', 'no name', 'noname', 'decool',
];
// (a trailing space = the whole word: "mix " but not "Mixels")
const BULK = [
  'kilogram', 'kg ', 'na kilo', 'po kilu', 'rinfuz', 'mix ', 'miks ', 'mesano', 'mesane', 'razne kocke', 'razne lego',
  'razni delovi', 'gomila', 'paket kocaka', 'kutija kocaka', 'kesa kocaka', 'dzak', 'rasute', 'rasuto', 'kockice na',
  'kocke na', 'delovi za', 'rezervni delovi', 'pojedinacni delovi', 'lot ',
];
const BULK_RE = /\d\s*(kg|kila|kilo)\b/i;
const PROMO = ['promo', 'promotivn', 'poklon uz', 'gwp', 'reklamn'];
const NOT_A_SET = [
  // games and media
  'igric', 'video igra', 'ps4', 'ps5', 'ps3', 'playstation', 'xbox', 'nintendo', 'switch', 'pc igra', 'wii', 'dvd',
  'blu ray', 'poster', 'nalepnic', 'stiker', 'casopis', 'magazin', 'katalog',
  // around a set, not a set
  'uputstvo za', 'uputstva za', 'samo uputstv', 'prazna kutija', 'samo kutija', 'kutija bez', 'bez kocaka', 'vitrin',
  'stalak', 'display', 'led ', 'osvetljenj', 'rasvet', 'svetla za', 'svetlo', 'light kit', 'lightkit', 'lighting',
  'brickbling', 'kofer za',
];
/** a single minifigure: the title starts with it */
const MINIFIG_START = /^(lego\s+)?(mini\s*)?(figur|minifig)/;

const PHONE = /(\+?381|\b0)[\s/-]?6\d[\s/-]?\d{3}[\s/-]?\d{3,4}/g;
const YEAR_RE = /^(19[4-9]\d|20[0-4]\d)$/;

/** "23 €" / "1.200 din" / "Kontakt" -> amount and currency (null = no price) */
export function kpPrice(text: string): KpPrice | null {
  const t = text.replace(/ /g, ' ');
  const m = t.match(/(\d{1,3}(?:[. ]\d{3})+|\d+)(?:,(\d{1,2}))?\s*(€|eur|evra|din|rsd)/i);
  if (!m) return null;
  const amount = Number(m[1].replace(/[. ]/g, '')) + (m[2] ? Number(`0.${m[2]}`) : 0);
  if (!amount) return null;
  return { amount, currency: /din|rsd/i.test(m[3]) ? 'RSD' : 'EUR' };
}

export const toRsd = (p: KpPrice, eurRate: number) => Math.round(p.currency === 'EUR' ? p.amount * eurRate : p.amount);

/**
 * Every known set number in a text, in order of appearance, without repeats. Skips phone numbers,
 * years ("iz 1988. godine"), piece counts ("1254 delova"), prices ("5000 din") and sizes.
 */
export function setNumbersIn(text: string, isKnown: (n: string) => boolean): string[] {
  const t = text.replace(PHONE, ' ');
  const out: string[] = [];
  // not glued to letters either: "njo0009" is a minifigure code, not set 0009
  const re = /(?<![\p{L}\d.,/])(\d{4,6})(?:-1)?(?![\d/]|[.,]\d)/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const num = m[1];
    const after = t.slice(m.index + m[0].length, m.index + m[0].length + 14).toLowerCase();
    const before = t.slice(Math.max(0, m.index - 8), m.index).toLowerCase();
    if (/^\s*(delova|dela|delov|komad|kom\b|kom\.|pcs|pieces|elemen|kockic|kocki|din|rsd|€|eur|evr|cm|mm|god|g\.)/.test(after)) continue;
    if (/(€|eur|din|rsd|cena|cenu)\s*:?\s*$/.test(before)) continue;
    if (YEAR_RE.test(num) && (/^\s*\./.test(after) || /(iz|od|do|za|god\.?|godine|godina)\s*$/.test(before))) continue;
    if (num.startsWith('0') || !isKnown(num) || out.includes(num)) continue;
    out.push(num);
  }
  return out;
}

function sharesName(title: string, set: KnownSet): boolean {
  const words = nameWords(title);
  return set.names.some((n) => [...nameWords(n)].some((w) => words.has(w)));
}

/** The title points to another theme than the set's, and shares no word with the set's names */
function nameConflict(title: string, set: KnownSet): boolean {
  if (sharesName(title, set)) return false;
  const theme = themeFromRaw(title);
  return !!theme && !!set.theme && !sameFamily(theme, set.theme);
}

/** Used sets can be cheap and collectors pay more for rare ones, so the window is wide */
function believablePrice(rsd: number, set: KnownSet): boolean {
  if (rsd < 300 || rsd > 1_500_000) return false;
  if (!set.rrp) return true;
  const r = rsd / set.rrp;
  return r >= 0.25 && r <= 3;
}

export function classifyAd(ad: KpAd, ctx: KpContext): KpDecision {
  const title = ad.title.trim();
  const both = `${title} ${ad.snippet}`;
  const nTitle = normalizeText(title);

  if ((ad.type && ad.type !== 'sell') || WANTED.some((w) => nTitle.startsWith(w))) return { kind: 'skip', why: 'wanted' };
  if (hasWord(title, NOT_LEGO) || hasWord(ad.snippet, NOT_LEGO_TEXT)) return { kind: 'skip', why: 'not_lego' };
  if (hasWord(title, BULK) || BULK_RE.test(title)) return { kind: 'skip', why: 'bulk' };
  if (hasWord(both, PROMO)) return { kind: 'skip', why: 'promo' };
  if (MINIFIG_START.test(nTitle) || hasWord(title, NOT_A_SET) || isMerchandise(title)) return { kind: 'skip', why: 'not_a_set' };
  if (ad.condition === 'osteceno') return { kind: 'skip', why: 'damaged' };

  const isKnown = (n: string) => !!ctx.known(n);
  const inTitle = setNumbersIn(title, isKnown);
  if (inTitle.length > 1) return { kind: 'skip', why: 'multi', setNums: inTitle };
  const inText = setNumbersIn(ad.snippet, isKnown);
  let setNum: string;
  let doubt: ReviewReason | null = null;
  if (inTitle.length === 1) {
    setNum = inTitle[0];
    if (inText.some((n) => n !== setNum)) doubt = 'more_numbers';
  } else if (inText.length === 1) {
    setNum = inText[0];
    doubt = 'number_in_text';
  } else if (inText.length > 1) {
    return { kind: 'skip', why: 'multi', setNums: inText };
  } else {
    return { kind: 'skip', why: 'no_number' };
  }

  const set = ctx.known(setNum)!;
  if (set.notASet) return { kind: 'skip', why: 'not_a_set', setNums: [setNum] };
  // the number only in the description is enough when the title names the same set
  if (doubt === 'number_in_text' && sharesName(title, set)) doubt = null;

  const price = ad.priceAmount && ad.currency ? { amount: ad.priceAmount, currency: ad.currency } : kpPrice(ad.priceText);
  if (!price) return { kind: 'skip', why: 'no_price', setNums: [setNum] };
  const priceRsd = toRsd(price, ctx.eurRate);
  if (!doubt && nameConflict(title, set)) doubt = 'name';
  if (!doubt && !believablePrice(priceRsd, set)) doubt = 'price';
  return doubt ? { kind: 'review', setNum, priceRsd, price, why: doubt } : { kind: 'show', setNum, priceRsd, price };
}

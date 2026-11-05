import { hasWord, isMerchandise, nameWords, sameFamily } from '../crawler/matching.js';
import { normalizeText } from '../lib/normalize.js';
import { cleanTitle } from '../lib/setnum.js';
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
  /** set names that belong to one set only, for ads without a number (see buildNameIndex) */
  names?: NameIndex;
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
  | 'number_in_text' // the number is only in the description
  | 'name_only'; // no number, and the set's name is short or common

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
/**
 * In the title: anything that says copy. In the description only clear phrases: a real Mario
 * expansion set is "kompatibilan" with the starter set, and "bez replika" is a good sign.
 */
const NOT_LEGO_TEXT = [
  'kompatibil sa lego', 'kompatibilan sa lego', 'kompatibilna sa lego', 'kompatibilne sa lego', 'kompatibilni sa lego',
  'kompatibilno sa lego', 'kompatibilan sa orig', 'kompatibilni sa orig', 'compatible with lego', 'lego compatible',
  'lego kompatibil', 'tipa lego', 'kao lego', 'slicno lego', 'lepin', 'nije original', 'nisu original', 'kopij',
  'lego like',
];
// ("replika" is LEGO's own word in descriptions: "detaljna LEGO replika kacige")
const NEGATED = /\b(bez|nije|nisu|nema)\s+(replik|kopij)\w*/g;
/** several sets offered together, said in words */
const MULTI_WORDS = ['setovi', 'setova', 'kolekcij', 'set of', 'oba ', 'dva seta', 'tri seta', 'preostal'];
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
  // games and media ("Nintendo Entertainment System" 71374 is a set)
  'igric', 'video igra', 'ps4', 'ps5', 'ps3', 'playstation', 'xbox', 'pc igra', 'wii', 'dvd',
  'blu ray', 'poster', 'nalepnic', 'stiker', 'casopis', 'magazin', 'katalog',
  // around a set, not a set
  // ("Build and Display Model" is LEGO's own wording, a display case is not a set)
  'uputstvo za', 'uputstva za', 'samo uputstv', 'prazna kutija', 'samo kutija', 'kutija bez', 'bez kocaka', 'vitrin',
  'stalak', 'display case', 'display stand', 'display box', 'case for', 'led ', 'osvetljenj', 'rasvet', 'svetla za',
  'svetlo', 'light kit', 'lightkit', 'lighting', 'brickbling', 'briksmax', 'lightailing', 'kofer za', 'za lego', 'for lego',
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
    // (whole words: "21320 Dinosaur Fossils" is not "din")
    if (/^\s*(delova|dela\b|delov|dijel|komad|kom\b|kom\.|pcs\b|psc\b|pieces|elemen|kockic|kocki\b|din\b|rsd\b|€|eur\b|evr|cm\b|mm\b|god\b|god\.|godin|g\.)/i.test(after)) continue;
    // glued to a word: fine for a modern number ("76457Selo Hogsmid"), not for a model name ("John Deere 1470H")
    if (num.length === 4 && /^\p{L}/u.test(t.slice(m.index + m[0].length))) continue;
    // a price word just before ("cena: 4500", "din 4500"), but not the end of a word ("Lego Aladdin 40613")
    if (/(?:^|[^\p{L}])(€|eur|din|rsd|cena|cenu)\s*:?\s*$/u.test(before)) continue;
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
  if (hasWord(title, NOT_LEGO) || hasWord(normalizeText(ad.snippet).replace(NEGATED, ' '), NOT_LEGO_TEXT)) return { kind: 'skip', why: 'not_lego' };
  if (hasWord(title, BULK) || BULK_RE.test(title)) return { kind: 'skip', why: 'bulk' };
  if (hasWord(both, PROMO)) return { kind: 'skip', why: 'promo' };
  if (MINIFIG_START.test(nTitle) || hasWord(title, NOT_A_SET)) return { kind: 'skip', why: 'not_a_set' };
  // bags, bottles, keyrings...: skipped unless the number is a real set ("Kreativni kofer 10713" is one);
  // ("policajac" is not "polica", a shelf)
  const merch = isMerchandise(title.replace(/polica(j|jc)/gi, 'pandur'));
  if (ad.condition === 'osteceno') return { kind: 'skip', why: 'damaged' };

  const isKnown = (n: string) => !!ctx.known(n);
  // a number that looks like a year ("Formula 2004", "Božićni kalendar 2024"), a price or a quantity
  // ("staze (1500 obe)") counts only when the title names that set; next to a modern 5–6 digit number,
  // 4-digit ones are piece counts or model names ("42063 BMW R 1200", "42055 ... (3929")
  const weak = (n: string) => YEAR_RE.test(n) || Number(n) < 2000;
  const strongest = (nums: string[]) => {
    const out = nums.filter((n) => !weak(n) || sharesName(title, ctx.known(n)!));
    return out.some((n) => n.length >= 5) ? out.filter((n) => n.length >= 5) : out;
  };
  if (hasWord(title, MULTI_WORDS)) return { kind: 'skip', why: 'multi' };
  let inTitle = strongest(setNumbersIn(title, isKnown));
  if (inTitle.length > 1) return { kind: 'skip', why: 'multi', setNums: inTitle };
  const inText = strongest(setNumbersIn(ad.snippet, isKnown));
  // "LEGO Technic BMW M 1000 RR" + "Article No. 42130": the set number is the one in the description
  const modern = inText.filter((n) => n.length >= 5 && sharesName(title, ctx.known(n)!));
  if (inTitle.length === 1 && inTitle[0].length === 4 && modern.length === 1) inTitle = modern;
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
    // no number: the set's own name in the title ("LEGO Avatar: The Way of Water Payakan The Tulkun & Crabsuit")
    const hit = !merch && ctx.names ? setByName(title, ctx.names) : null;
    if (hit === 'ambiguous') return { kind: 'skip', why: 'multi' };
    if (!hit) return { kind: 'skip', why: merch ? 'not_a_set' : 'no_number' };
    setNum = hit.num;
    if (!distinctiveName(hit.name)) doubt = 'name_only';
  }

  const set = ctx.known(setNum)!;
  if (set.notASet) return { kind: 'skip', why: 'not_a_set', setNums: [setNum] };
  // the number only in the description is enough when the title names the same set
  if (doubt === 'number_in_text' && sharesName(title, set)) doubt = null;

  const price = ad.priceAmount && ad.currency ? { amount: ad.priceAmount, currency: ad.currency } : kpPrice(ad.priceText);
  if (!price) return { kind: 'skip', why: 'no_price', setNums: [setNum] };
  const priceRsd = toRsd(price, ctx.eurRate);
  if (!doubt && !believablePrice(priceRsd, set)) doubt = 'price';
  if (!doubt && nameConflict(title, set) && set.rrp && (priceRsd < set.rrp * 0.5 || priceRsd > set.rrp * 2)) doubt = 'name';
  return doubt ? { kind: 'review', setNum, priceRsd, price, why: doubt } : { kind: 'show', setNum, priceRsd, price };
}

// ---- set names, for ads without a number ----

/**
 * exact: first word of a normalized name -> the names starting with it and their set;
 * bags: a name's own words in any order (three or more), keyed by its first one
 */
export interface NameIndex {
  exact: Map<string, { name: string; num: string }[]>;
  bags: Map<string, { name: string; num: string; words: string[] }[]>;
}

/**
 * Names that belong to exactly one set (our Serbian names and the catalog's English ones) and still
 * say something without the theme: "Harry Potter: Hogwarts" or "Sonic the Hedgehog" is just the theme,
 * and a name several sets share ("Millennium Falcon", "Police Station") is left out, so it can never
 * pick one of them.
 */
export function buildNameIndex(rows: { num: string; names: string[] }[]): NameIndex {
  const owner = new Map<string, string | null>();
  const bagOwner = new Map<string, { num: string | null; name: string; words: string[] }>();
  const claim = <T extends { num: string | null }>(map: Map<string, T>, key: string, value: T) => {
    const prev = map.get(key);
    map.set(key, prev === undefined || prev.num === value.num ? value : { ...prev, num: null });
  };
  for (const r of rows) {
    for (const raw of r.names) {
      const n = normalizeText(cleanTitle(raw, r.num));
      const words = [...nameWords(n)];
      if (n.length < 10 || n.split(' ').length < 2 || words.length < 2) continue;
      const prev = owner.get(n);
      owner.set(n, prev === undefined || prev === r.num ? r.num : null);
      if (words.length >= 3) claim(bagOwner, [...words].sort().join(' '), { num: r.num, name: n, words });
    }
  }
  const idx: NameIndex = { exact: new Map(), bags: new Map() };
  for (const [name, num] of owner) {
    if (!num) continue;
    const first = name.split(' ')[0];
    if (!idx.exact.has(first)) idx.exact.set(first, []);
    idx.exact.get(first)!.push({ name, num });
  }
  for (const { num, name, words } of bagOwner.values()) {
    if (!num) continue;
    if (!idx.bags.has(words[0])) idx.bags.set(words[0], []);
    idx.bags.get(words[0])!.push({ name, num, words });
  }
  return idx;
}

/**
 * The one set whose name is in the title; the longest name wins over a shorter one inside it. Then,
 * in any word order, a name of three or more words of its own ("Gardens of Ninjago City" for
 * "Ninjago City Gardens", "The Pirate Ship Going Merry" for "Going Merry Pirate Ship").
 */
export function setByName(title: string, idx: NameIndex): { name: string; num: string } | 'ambiguous' | null {
  const padded = ` ${normalizeText(title)} `;
  const titleWords = new Set(padded.trim().split(' '));
  const hits: { name: string; num: string }[] = [];
  for (const word of titleWords) {
    for (const c of idx.exact.get(word) ?? []) if (padded.includes(` ${c.name} `)) hits.push(c);
  }
  hits.sort((a, b) => b.name.length - a.name.length);
  const kept: { name: string; num: string }[] = [];
  for (const h of hits) if (!kept.some((k) => k.name.includes(h.name))) kept.push(h);
  if (new Set(kept.map((k) => k.num)).size > 1) return 'ambiguous';
  if (kept[0]) return kept[0];

  const bagHits = [...titleWords].flatMap((w) => (idx.bags.get(w) ?? []).filter((c) => c.words.every((x) => titleWords.has(x))));
  if (!bagHits.length) return null;
  const most = Math.max(...bagHits.map((h) => h.words.length));
  const best = bagHits.filter((h) => h.words.length === most);
  if (new Set(best.map((h) => h.num)).size > 1) return 'ambiguous';
  return { name: best[0].name, num: best[0].num };
}

/**
 * Without a number, only a name with three words of its own is shown at once ("Payakan the Tulkun &
 * Crabsuit", "Old Trafford – Manchester United"); a shorter one can be a movie title or a minifigure
 * ("Chamber of Secrets", "Golden Dragon") and waits for the admin.
 */
function distinctiveName(name: string): boolean {
  return nameWords(name).size >= 3;
}

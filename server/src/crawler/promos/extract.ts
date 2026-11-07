import * as cheerio from 'cheerio';

export type PromoKind = 'gift' | 'sale' | 'online_only' | 'multi_buy' | 'code' | 'other';

/** What the crawler proposes; nothing here is shown to visitors until an admin approves it. */
export interface PromoCandidate {
  kind: PromoKind;
  title: string;
  details: string;
  minBasketRsd: number | null;
  discountPct: number | null;
  themes: string[];
  validFrom: string | null;
  validUntil: string | null;
  sourceUrl: string;
  /** how many of threshold / percent / dates / code we found: more means more likely a real promotion */
  signals: number;
}

export interface ExtractOptions {
  sourceUrl: string;
  /** keep only passages that mention LEGO (shops that sell other things too) */
  legoOnly?: boolean;
  themes?: { slug: string; name: string }[];
  /** title to use instead of the passage's first sentence (a blog post's headline) */
  titleHint?: string;
  now?: Date;
}

/** Lower case, no diacritics: "Poklon" and "poklon", "đ" and "dj" match alike. */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'dj').toLowerCase();
}

// stems of the Serbian month names (nominative and genitive share them: novembar / novembra)
const MONTH_STEMS: [string, number][] = [
  ['januar', 1], ['februar', 2], ['mart', 3], ['april', 4], ['maj', 5], ['jun', 6], ['jul', 7], ['avgust', 8],
  ['septembr', 9], ['septembar', 9], ['oktobr', 10], ['oktobar', 10], ['novembr', 11], ['novembar', 11], ['decembr', 12], ['decembar', 12],
];
const MONTH_RE = '(januar\\w*|februar\\w*|mart\\w*|april\\w*|maj\\w*|jun\\w*|jul\\w*|avgust\\w*|septembar\\w*|septembr\\w*|oktobar\\w*|oktobr\\w*|novembar\\w*|novembr\\w*|decembar\\w*|decembr\\w*)';

function monthNumber(word: string): number | null {
  return MONTH_STEMS.find(([stem]) => word.startsWith(stem))?.[1] ?? null;
}

function iso(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : null;
}

/** "od 2. do 8. novembra", "1.11.2026 ... 30.11.2026", "do 30.11." Years default to the current one. */
export function parseDates(text: string, now = new Date()): { from: string | null; until: string | null } {
  const f = fold(text);
  const year = now.getUTCFullYear();
  let from: string | null = null;
  let until: string | null = null;

  const words = new RegExp(`(\\d{1,2})\\.\\s*(?:${MONTH_RE}\\s*)?(?:do|-|–)\\s*(\\d{1,2})\\.\\s*${MONTH_RE}(?:\\s*(\\d{4}))?`);
  const w = words.exec(f);
  if (w) {
    const endMonth = monthNumber(w[4]!);
    const startMonth = w[2] ? monthNumber(w[2]) : endMonth;
    const y = w[5] ? Number(w[5]) : year;
    if (endMonth && startMonth) {
      from = iso(y, startMonth, Number(w[1]));
      until = iso(y, endMonth, Number(w[3]));
    }
  }

  if (!from && !until) {
    const numeric = [...f.matchAll(/(\d{1,2})\.\s?(\d{1,2})\.(?:\s?(\d{4}))?/g)];
    const found = numeric
      .map((m) => ({ at: m.index ?? 0, date: iso(m[3] ? Number(m[3]) : year, Number(m[2]), Number(m[1])) }))
      .filter((x): x is { at: number; date: string } => !!x.date);
    if (found.length >= 2) {
      const dates = found.map((x) => x.date).sort();
      from = dates[0]!;
      until = dates[dates.length - 1]!;
    } else if (found.length === 1) {
      const before = f.slice(Math.max(0, found[0]!.at - 8), found[0]!.at);
      if (/\bdo\s*$/.test(before)) until = found[0]!.date;
      else if (/\bod\s*$/.test(before)) from = found[0]!.date;
    }
  }
  return { from, until };
}

const MONEY = '(\\d{1,3}(?:\\.\\d{3})+|\\d{3,6})(?:,\\d{2})?\\s*(?:rsd|din\\b|dinara)';

/** "preko 30.000 RSD", "većoj od 16.000 RSD" → 30000 */
export function parseThreshold(text: string): number | null {
  const m = new RegExp(`(?:preko|iznad|vecoj od|vece od|veca od|najmanje|minimum|od)\\s+${MONEY}`).exec(fold(text));
  if (!m) return null;
  const n = Number(m[1]!.replace(/\./g, ''));
  return n >= 100 ? n : null;
}

function parsePercent(text: string): number | null {
  const m = /(\d{1,2})\s?%/.exec(text);
  const n = m ? Number(m[1]) : null;
  return n && n >= 1 && n <= 90 ? n : null;
}

function parseCode(text: string): string | null {
  const m = /(?:promo\s*)?kod(?:om)?\s*[:\-]?\s*([A-Z][A-Z0-9_]{3,})/.exec(text);
  return m ? m[1]! : null;
}

function kindOf(f: string, code: string | null, pct: number | null): PromoKind {
  if (/poklon|gratis|za (samo )?1 rsd/.test(f)) return 'gift';
  if (/vise setova|\bdva seta|\b[2-9] seta|kupi \d|\b\d ?\+ ?\d\b|drugi set/.test(f)) return 'multi_buy';
  if (/samo onlajn|samo online|samo na sajtu|samo preko sajta/.test(f)) return 'online_only';
  if (code) return 'code';
  if (pct != null || /popust|akcij|snizenj/.test(f)) return 'sale';
  return 'other';
}

const KEYWORD = /poklon|gratis|popust|akcij|snizenj|promocij|za (samo )?1 rsd|besplatn\w* (set|poklon|isporuk|dostav)|\bkod\b|kupon/;

function firstSentence(s: string, max = 140): string {
  const cut = s.split(/(?<=[.!?])\s+/)[0] ?? s;
  return (cut.length > max ? `${cut.slice(0, max - 1).trimEnd()}…` : cut).trim();
}

function matchThemes(f: string, themes: { slug: string; name: string }[]): string[] {
  // only when the text speaks of themes at all; an eligible-sets list that names Star Wars must not narrow a promotion to it
  if (!/\btem[ae]\w*|\btemama|\bserij\w*|\blinij\w*/.test(f)) return [];
  const hit = themes.filter((t) => {
    const n = fold(t.name).replace(/[^a-z0-9 ]/g, '').trim();
    return n.length >= 4 && new RegExp(`(^|[^a-z0-9])${n.replace(/ +/g, ' +')}([^a-z0-9]|$)`).test(f);
  });
  return hit.slice(0, 6).map((t) => t.slug);
}

/** Text blocks worth reading: paragraphs, list items, headings and small banner elements. Navigation, footers and scripts are dropped. */
export function passagesFromHtml(html: string): string[] {
  const $ = cheerio.load(html);
  $('script,style,noscript,svg,nav,footer,header,form,iframe,template').remove();
  const blockish = 'p,li,div,ul,ol,table,h1,h2,h3,h4,h5,h6,blockquote,section,article';
  const out: string[] = [];
  const seen = new Set<string>();
  $('p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th,figcaption,div,span,a').each((_, el) => {
    const node = $(el);
    const tag = (el as { tagName?: string }).tagName ?? '';
    // div/span/a count only when they are leaves (banners); otherwise their paragraphs are read on their own
    if (['div', 'span', 'a'].includes(tag) && node.find(blockish).length > 0) return;
    const text = node.text().replace(/\s+/g, ' ').trim();
    if (text.length < 25 || text.length > 800 || seen.has(text)) return;
    seen.add(text);
    out.push(text);
  });
  return out;
}

/** Turns text blocks into proposals. Strict on purpose: a passage needs a promotion word and something concrete (amount, percent, dates, code). */
export function extractPromos(passages: string[], opt: ExtractOptions): PromoCandidate[] {
  const now = opt.now ?? new Date();
  const today = now.toISOString().slice(0, 10);
  const byKey = new Map<string, PromoCandidate>();

  for (const raw of passages) {
    const f = fold(raw);
    if (!KEYWORD.test(f)) continue;
    if (opt.legoOnly && !f.includes('lego') && !opt.sourceUrl.toLowerCase().includes('lego')) continue;

    const minBasketRsd = parseThreshold(raw);
    const discountPct = parsePercent(raw);
    const code = parseCode(raw);
    const { from, until } = parseDates(raw, now);
    const signals = [minBasketRsd, discountPct, code, from ?? until].filter((x) => x != null).length;
    const kind = kindOf(f, code, discountPct);
    if (signals === 0 && !/za (samo )?1 rsd/.test(f)) continue;
    if (until && until < today) continue; // already over

    const details = raw.length > 600 ? `${raw.slice(0, 599).trimEnd()}…` : raw;
    const c: PromoCandidate = {
      kind,
      title: opt.titleHint?.trim() || firstSentence(raw),
      details,
      minBasketRsd,
      discountPct,
      themes: matchThemes(f, opt.themes ?? []),
      validFrom: from,
      validUntil: until,
      sourceUrl: opt.sourceUrl,
      signals,
    };
    const key = `${kind}|${c.title.toLowerCase()}`;
    const prev = byKey.get(key);
    if (!prev || prev.signals < c.signals) byKey.set(key, c);
  }
  return [...byKey.values()];
}

export interface FeedEntry {
  title: string;
  url: string;
  published: string | null;
  html: string;
}

/** Shopify's blog feed (Atom): newest posts with their text. */
export function parseAtomFeed(xml: string): FeedEntry[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  return $('entry')
    .map((_, el) => {
      const e = $(el);
      const link = e.find('link[rel="alternate"]').attr('href') ?? e.find('link').first().attr('href') ?? '';
      return {
        title: e.children('title').text().trim(),
        url: link,
        published: e.children('published').text().trim() || e.children('updated').text().trim() || null,
        html: e.children('content').text() || e.children('summary').text(),
      };
    })
    .get()
    .filter((x) => x.url);
}

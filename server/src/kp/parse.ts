import type { KpCondition } from './classify.js';

/*
 * KupujemProdajem's search page is a Next.js page: the ads are in the JSON of <script id="__NEXT_DATA__">
 * (props.initialReduxState.adNavigation), with the condition, the price as a number with its currency,
 * the town and the photo links, so nothing has to be read from the HTML itself. Checked on 4 Nov 2026.
 */

export const KP_ORIGIN = 'https://www.kupujemprodajem.com';
/** LEGO in Igračke i igre → Kockice: 5.139 ads on 172 pages on 4 Nov 2026 (about 800 more are video games and figurines) */
export const KP_SEARCH = `${KP_ORIGIN}/igracke-i-igre/kockice/pretraga?keywords=lego&categoryId=1157&groupId=271`;
export const kpPageUrl = (page: number) => (page <= 1 ? KP_SEARCH : `${KP_SEARCH}&page=${page}`);

export interface KpListing {
  id: string;
  title: string;
  snippet: string;
  /** "23 €", "1.200 din", "Kontakt" */
  priceText: string;
  priceAmount: number | null;
  currency: 'RSD' | 'EUR' | null;
  condition: KpCondition;
  /** "sell" (Prodajem) or "buy" (Kupujem) */
  type: string;
  location: string;
  url: string;
  /** the first photo, full size and 300×300 (on KP's server; shown from there, never copied) */
  image: string | null;
  thumb: string | null;
  /** "2026-10-28 18:08:05", Belgrade time */
  postedAt: string | null;
}

export interface KpPage {
  /** KP shows a check ("are you human") instead of results */
  blocked: boolean;
  page: number;
  pages: number;
  total: number;
  ads: KpListing[];
}

const CONDITIONS: Record<string, KpCondition> = { new: 'novo', 'as-new': 'nekorisceno', used: 'korisceno' };

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v));

/** One ad from adNavigation.byId (also the lines of the agent's kp-oglasi.jsonl) */
export function listingFromKp(a: Record<string, unknown>): KpListing {
  const cur = str(a.currencyAcronym).toLowerCase();
  const amount = typeof a.priceNumber === 'number' && a.priceNumber > 0 ? a.priceNumber : null;
  const adUrl = str(a.adUrl);
  return {
    id: str(a.id),
    title: str(a.name),
    snippet: str(a.descriptionSnippetDecoded).replace(/\s*\.\.\.$/, ''),
    priceText: str(a.priceText),
    priceAmount: amount,
    currency: amount ? (cur === 'eur' ? 'EUR' : cur === 'rsd' ? 'RSD' : null) : null,
    // anything else ("Oštećeno ili neispravno") is never shown
    condition: CONDITIONS[str(a.conditionId)] ?? 'osteceno',
    type: str(a.type) || 'sell',
    location: str(a.location),
    url: adUrl.startsWith('http') ? adUrl : `${KP_ORIGIN}${adUrl}`,
    image: str(a.image) || null,
    thumb: str(a.smallImage) || null,
    postedAt: str(a.postedRaw) || null,
  };
}

export function parseKpSearch(html: string): KpPage {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  const empty = { page: 0, pages: 0, total: 0, ads: [] };
  if (!m) return { blocked: true, ...empty };
  let st: Record<string, any> | undefined;
  try {
    st = JSON.parse(m[1])?.props?.initialReduxState;
  } catch {
    return { blocked: true, ...empty };
  }
  const bot = st?.antiBot ?? {};
  const check =
    Object.keys(bot.antiBotHumanCheck ?? {}).length > 0 || Object.keys(bot.areYouHumanError ?? {}).length > 0 || !!bot.captchaSiteKey;
  const nav = st?.adNavigation;
  if (check || !nav) return { blocked: true, ...empty };
  const ads = ((nav.adsIds ?? []) as (string | number)[])
    .map((id) => nav.byId?.[String(id)])
    .filter((a): a is Record<string, unknown> => !!a)
    .map(listingFromKp);
  return { blocked: false, page: Number(nav.page) || 1, pages: Number(nav.pages) || 1, total: Number(nav.total) || ads.length, ads };
}

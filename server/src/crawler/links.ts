import { one, query } from '../db.js';
import { normalizeText } from '../lib/normalize.js';
import { HIDDEN_METHODS, loadRules } from './hiding.js';
import { linkDoubts, type LinkDoubt } from './matching.js';
import { autoLink, initialSetName, loadMatchIndex } from './pipeline.js';

// The admin's table of every offer on the site: which set each one is linked to and how, with the
// tools to fix a wrong link (another set number, or back to automatic).

export const LINK_FILTERS = ['all', 'linked', 'manual', 'check', 'open', 'merch', 'hidden'] as const;
export type LinkFilter = (typeof LINK_FILTERS)[number];
export const OFFER_SORTS = ['title', 'shop', 'price', 'set', 'linked'] as const;
export type OfferSort = (typeof OFFER_SORTS)[number];

export interface AdminOffer {
  id: number;
  shop_id: string;
  seller: string;
  title: string;
  url: string;
  image_url: string | null;
  price_rsd: number;
  in_stock: boolean;
  set_num: string | null;
  set_name: string | null;
  set_image: string | null;
  match_method: string | null;
  manual_at: string | null;
  manual_by: string | null;
  /** why the link looks wrong (linked offers only) */
  doubts: LinkDoubt[];
}

type Row = Omit<AdminOffer, 'doubts'> & { first_seen: string };

const isHidden = (r: Row) => HIDDEN_METHODS.includes(r.match_method ?? '');
const isOpen = (r: Row) => !r.set_num && r.match_method !== 'merch' && !isHidden(r);

function inFilter(r: Row & { doubts: LinkDoubt[] }, f: LinkFilter): boolean {
  switch (f) {
    case 'all':
      return true;
    case 'linked':
      return !!r.set_num;
    case 'manual':
      return r.match_method === 'manual';
    case 'check':
      return r.doubts.length > 0;
    case 'open':
      return isOpen(r);
    case 'merch':
      return r.match_method === 'merch';
    case 'hidden':
      return isHidden(r);
  }
}

const METHOD_RANK = ['manual', 'sku', 'title', 'name', 'merch', 'hidden', 'hidden_rule'];
const rank = (m: string | null) => (m ? METHOD_RANK.indexOf(m) : METHOD_RANK.length);
const coll = new Intl.Collator('sr', { numeric: true, sensitivity: 'base' });

function sorter(sort: OfferSort): (a: Row, b: Row) => number {
  switch (sort) {
    case 'title':
      return (a, b) => coll.compare(a.title, b.title);
    case 'shop':
      return (a, b) => coll.compare(a.shop_id, b.shop_id) || coll.compare(a.title, b.title);
    case 'price':
      return (a, b) => a.price_rsd - b.price_rsd;
    case 'set':
      // offers without a set at the end
      return (a, b) => (!a.set_num ? 1 : 0) - (!b.set_num ? 1 : 0) || coll.compare(a.set_num ?? '', b.set_num ?? '') || coll.compare(a.title, b.title);
    case 'linked':
      // newest hand-made links first, then by how the offer was linked
      return (a, b) =>
        (b.manual_at ? Date.parse(b.manual_at) : 0) - (a.manual_at ? Date.parse(a.manual_at) : 0) ||
        rank(a.match_method) - rank(b.match_method) ||
        coll.compare(a.title, b.title);
  }
}

export interface OfferListParams {
  q?: string;
  shop?: string;
  filter?: LinkFilter;
  sort?: OfferSort;
  dir?: 'asc' | 'desc';
  page?: number;
  size?: number;
}

/**
 * Every active offer with its set, filtered by words (title, seller, set number or set name, any
 * order, without diacritics), shop and link status; counts per status for the same search.
 */
export async function listOffers(p: OfferListParams) {
  const rows = await query<Row>(
    `SELECT o.id, o.shop_id, o.seller, o.title, o.url, o.image_url, o.price_rsd, o.in_stock, o.set_num,
            s.name AS set_name, s.image_url AS set_image, o.match_method, o.manual_at, o.first_seen,
            coalesce(nullif(u.name, ''), u.email) AS manual_by
       FROM offers o
       LEFT JOIN sets s ON s.set_num = o.set_num
       LEFT JOIN users u ON u.id = o.manual_by
      WHERE o.active ${p.shop ? 'AND o.shop_id = $1' : ''}`,
    p.shop ? [p.shop] : [],
  );
  const words = normalizeText(p.q).split(' ').filter(Boolean);
  const found = words.length
    ? rows.filter((r) => {
        const hay = ` ${normalizeText(`${r.title} ${r.seller} ${r.set_num ?? ''} ${r.set_name ?? ''}`)} `;
        return words.every((w) => hay.includes(` ${w}`));
      })
    : rows;

  const idx = await loadMatchIndex();
  const all = found.map((r) => ({ ...r, doubts: r.set_num ? linkDoubts({ title: r.title, price: r.price_rsd }, r.set_num, idx) : [] }));
  const counts = Object.fromEntries(LINK_FILTERS.map((f) => [f, all.filter((r) => inFilter(r, f)).length])) as Record<LinkFilter, number>;

  const filter = p.filter ?? 'all';
  const sort = p.sort ?? (filter === 'manual' ? 'linked' : 'title');
  const items = all.filter((r) => inFilter(r, filter)).sort(sorter(sort));
  if (p.dir === 'desc') items.reverse();
  const size = Math.min(Math.max(p.size ?? 50, 10), 200);
  const pages = Math.max(1, Math.ceil(items.length / size));
  const page = Math.min(Math.max(p.page ?? 1, 1), pages);
  return {
    total: items.length,
    page,
    pages,
    size,
    sort,
    counts,
    items: items.slice((page - 1) * size, page * size).map(({ first_seen, ...r }) => r),
  };
}

export interface SetLookup {
  set_num: string;
  name: string;
  image_url: string | null;
  theme_name: string | null;
  rrp_rsd: number | null;
  offers: number;
}

/** A set as the admin types its number: so a typo shows a different name before anything is saved. */
export async function lookupSet(setNum: string): Promise<SetLookup | null> {
  return one<SetLookup>(
    `SELECT s.set_num, s.name, s.image_url, t.name AS theme_name, s.rrp_rsd,
            (SELECT count(*) FROM offers o WHERE o.set_num = s.set_num AND o.active)::int AS offers
       FROM sets s LEFT JOIN themes t ON t.slug = s.theme_slug WHERE s.set_num = $1`,
    [setNum],
  );
}

/**
 * Sets nobody links to any more. A set row only comes from a linked offer, so one without any offer
 * was made by a mistyped number; it would otherwise stay reachable as an empty set page.
 */
export async function dropOrphanSets(setNums: (string | null | undefined)[]): Promise<string[]> {
  const nums = [...new Set(setNums.filter((n): n is string => !!n))];
  if (!nums.length) return [];
  const rows = await query<{ set_num: string }>(
    `DELETE FROM sets s WHERE s.set_num = ANY($1::text[])
        AND NOT EXISTS (SELECT 1 FROM offers o WHERE o.set_num = s.set_num) RETURNING s.set_num`,
    [nums],
  );
  return rows.map((r) => r.set_num);
}

export class UnknownSetError extends Error {
  constructor(public setNum: string) {
    super(`Set ${setNum} nije u katalogu. Proveri broj; ako je tačan, potvrdi povezivanje.`);
  }
}

/**
 * Links an offer to a set by hand (it stays linked on every crawl). A number that isn't in the
 * catalogue needs `confirmNew`: most of the time it is a typo.
 */
export async function linkOffer(id: number, setNum: string, adminId: number, opts: { confirmNew?: boolean } = {}) {
  const offer = await one<{ id: number; shop_id: string; title: string; image_url: string | null; set_num: string | null }>(
    'SELECT id, shop_id, title, image_url, set_num FROM offers WHERE id = $1',
    [id],
  );
  if (!offer) return null;
  if (!(await one('SELECT 1 FROM sets WHERE set_num = $1', [setNum]))) {
    if (!opts.confirmNew) throw new UnknownSetError(setNum);
    await query('INSERT INTO sets (set_num, name, image_url) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [
      setNum,
      initialSetName(offer.shop_id, offer.title, setNum),
      offer.image_url,
    ]);
  }
  await query(
    "UPDATE offers SET set_num = $2, match_method = 'manual', manual_at = now(), manual_by = $3 WHERE id = $1",
    [id, setNum, adminId],
  );
  const dropped = offer.set_num !== setNum ? await dropOrphanSets([offer.set_num]) : [];
  return { previous: offer.set_num, setNum, dropped };
}

/** Undoes a hand-made link: the offer is linked the way the crawler would link it, right away. */
export async function resetLink(id: number) {
  const o = await one<{
    shop_id: string;
    kind: string;
    title: string;
    image_url: string | null;
    sku: string | null;
    sku_guess: string | null;
    price_rsd: number;
    set_num: string | null;
  }>(
    `SELECT o.shop_id, sh.kind, o.title, o.image_url, o.sku, o.sku_guess, o.price_rsd, o.set_num
       FROM offers o JOIN shops sh ON sh.id = o.shop_id WHERE o.id = $1`,
    [id],
  );
  if (!o) return null;
  const [idx, rules] = await Promise.all([loadMatchIndex(), loadRules()]);
  const link = autoLink({ title: o.title, sku: o.sku, skuGuess: o.sku_guess, priceRsd: o.price_rsd }, o.shop_id, o.kind === 'official', idx, rules);
  if (link.setNum && !idx.known.has(link.setNum)) {
    // the shop's own code names a set we haven't seen yet: add it, as the crawler would
    await query('INSERT INTO sets (set_num, name, image_url) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [
      link.setNum,
      initialSetName(o.shop_id, o.title, link.setNum),
      o.image_url,
    ]);
  }
  await query('UPDATE offers SET set_num = $2, match_method = $3, manual_at = NULL, manual_by = NULL WHERE id = $1', [
    id,
    link.setNum,
    link.method,
  ]);
  const dropped = o.set_num !== link.setNum ? await dropOrphanSets([o.set_num]) : [];
  return { previous: o.set_num, setNum: link.setNum, method: link.method, dropped };
}

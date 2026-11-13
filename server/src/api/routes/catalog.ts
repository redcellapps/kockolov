import type { FastifyInstance } from 'fastify';
import { setForCode } from '../../crawler/ean.js';
import { pickFeatured } from '../../deals/featured.js';
import { z } from 'zod';
import { one, query } from '../../db.js';
import { normalizeText } from '../../lib/normalize.js';
import { listingsEnabledFor, usedAdsForSet, usedSummary } from '../../listings/service.js';
import { audienceOf, latestDeals, offersFor } from '../audience.js';
import { buildLockedSearch, buildSearch, buildShopFacet, buildThemeFacet, type SearchFilters } from '../search.js';

const csv = z
  .string()
  .optional()
  .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined));
const flag = z
  .string()
  .optional()
  .transform((v) => (v === undefined ? undefined : v === '1' || v === 'true'));
const num = z.coerce.number().int().nonnegative().optional();

const searchSchema = z.object({
  q: z.string().max(120).optional(),
  theme: csv,
  shop: csv,
  age: csv,
  min: num,
  max: num,
  sale: flag,
  stock: flag,
  sort: z.string().optional(),
  page: z.coerce.number().int().min(1).max(500).optional(),
  size: z.coerce.number().int().min(1).max(96).optional(),
});

/** Sets that match the search and have active ads, but no shop offer among the results */
async function usedOnlySets(f: SearchFilters, viewerId: number | null, already: string[]) {
  const params: unknown[] = [viewerId, already];
  const conds: string[] = [];
  for (const tok of normalizeText(f.q).split(' ').filter(Boolean).slice(0, 8)) {
    params.push(`%${tok}%`);
    conds.push(`s.search_text LIKE $${params.length}`);
  }
  if (f.themes?.length) {
    params.push(f.themes);
    conds.push(`s.theme_slug = ANY($${params.length}::text[])`);
  }
  const sets = await query<{ set_num: string; name: string; theme_slug: string | null; theme_name: string | null; image_url: string | null; rrp_rsd: number | null; age_min: number | null }>(
    `SELECT s.set_num, s.name, s.theme_slug, t.name AS theme_name, s.image_url, s.rrp_rsd, s.age_min
       FROM sets s LEFT JOIN themes t ON t.slug = s.theme_slug
      WHERE s.set_num <> ALL($2::text[])
        AND EXISTS (SELECT 1 FROM listings l WHERE l.set_num = s.set_num AND l.status = 'active' AND l.expires_at > now()
                      AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE b.blocker_id = $1::bigint AND b.blocked_id = l.user_id))
        ${conds.map((c) => `AND ${c}`).join(' ')}
      ORDER BY s.set_num DESC LIMIT 8`,
    params,
  );
  const used = await usedSummary(sets.map((x) => x.set_num), viewerId);
  return sets.map((x) => ({ ...x, used_count: used.get(x.set_num)?.count ?? 0, used_min_price: used.get(x.set_num)?.min ?? null }));
}

export async function catalogRoutes(app: FastifyInstance) {
  app.get('/api/sets', async (req) => {
    const qs = searchSchema.parse(req.query);
    const f: SearchFilters = {
      q: qs.q,
      themes: qs.theme,
      shops: qs.shop,
      ages: qs.age,
      min: qs.min,
      max: qs.max,
      sale: qs.sale,
      stock: qs.stock ?? true,
      sort: qs.sort,
      page: qs.page,
      size: qs.size,
      audience: audienceOf(req.user),
    };
    const s = buildSearch(f);
    const tf = buildThemeFacet(f);
    const sf = buildShopFacet(f);
    // anonymous visitors on the first page also see sets that exist only in members-only shops (no price, no shop)
    const wantLocked = f.audience === 'public' && s.page === 1 && !!(f.q || f.themes?.length) && !f.shops?.length && f.min === undefined && f.max === undefined && !f.sale;
    const lq = wantLocked ? buildLockedSearch(f) : null;
    const [rows, themes, shops, lockedRows] = await Promise.all([
      query(s.sql, s.params),
      query(tf.sql, tf.params),
      query(sf.sql, sf.params),
      lq ? query(lq.sql, lq.params) : Promise.resolve([]),
    ]);
    // second-hand ads: how many and from what price on each set found, and sets found only in ads
    const adsOn = listingsEnabledFor(req.user);
    const viewerId = req.user?.id ?? null;
    const used = adsOn ? await usedSummary(rows.map((r) => r.set_num as string), viewerId) : new Map();
    const usedOnly = adsOn && s.page === 1 && f.q && !f.shops?.length && f.min === undefined && f.max === undefined && !f.sale ? await usedOnlySets(f, viewerId, rows.map((r) => r.set_num as string)) : [];
    return {
      locked: { total: lockedRows[0]?.total ?? 0, items: lockedRows.map(({ total, ...r }) => r) },
      total: rows[0]?.total ?? 0,
      page: s.page,
      size: s.size,
      sort: s.sort,
      used_only: usedOnly,
      items: rows.map(({ total, search_text, created_at, ...r }) => ({ ...r, used_count: used.get(r.set_num as string)?.count ?? 0, used_min_price: used.get(r.set_num as string)?.min ?? null })),
      facets: { themes, shops },
    };
  });

  app.get<{ Params: { setNum: string } }>('/api/sets/:setNum', async (req, reply) => {
    const setNum = req.params.setNum;
    const audience = audienceOf(req.user);
    const visible = offersFor(audience);
    const set = await one(
      `SELECT s.set_num, s.name, s.name_en, s.theme_slug, t.name AS theme_name, s.year, s.pieces, s.age_min,
              s.image_url, s.rrp_rsd, s.created_at
         FROM sets s LEFT JOIN themes t ON t.slug = s.theme_slug WHERE s.set_num = $1`,
      [setNum],
    );
    if (!set) return reply.code(404).send({ error: 'Set nije pronađen' });

    const offers = await query(
      `SELECT o.id, o.shop_id, sh.name AS shop_name, sh.kind AS shop_kind, o.seller, o.title, o.url, o.image_url,
              o.price_rsd, o.regular_price_rsd, o.in_stock, o.stock_qty, o.last_seen, o.price_changed_at, o.match_method
         FROM ${visible} o JOIN shops sh ON sh.id = o.shop_id
        WHERE o.set_num = $1 AND o.active
        ORDER BY o.in_stock DESC, o.price_rsd ASC`,
      [setNum],
    );
    const history = await query(
      `SELECT ph.offer_id, ph.price_rsd, ph.in_stock, ph.recorded_at
         FROM price_history ph JOIN ${visible} o ON o.id = ph.offer_id
        WHERE o.set_num = $1 AND ph.recorded_at > now() - interval '365 days'
        ORDER BY ph.recorded_at`,
      [setNum],
    );
    const stats = await one(
      `SELECT min(ph.price_rsd) FILTER (WHERE ph.in_stock) AS lowest_ever,
              min(ph.price_rsd) FILTER (WHERE ph.in_stock AND ph.recorded_at > now() - interval '30 days') AS lowest_30d,
              min(ph.recorded_at) AS tracked_since
         FROM price_history ph JOIN ${visible} o ON o.id = ph.offer_id WHERE o.set_num = $1`,
      [setNum],
    );
    const deal = await one(
      `SELECT day, rank, score, best_price_rsd, reference_price_rsd, reasons FROM deals
        WHERE set_num = $1 AND ${latestDeals(audience)}`,
      [setNum],
    );
    let related: unknown[] = [];
    if (set.theme_slug) {
      const rq = buildSearch({ themes: [set.theme_slug], stock: true, sort: 'deal', size: 9, audience });
      related = (await query(rq.sql, rq.params))
        .filter((r) => r.set_num !== setNum)
        .slice(0, 8)
        .map(({ total, search_text, created_at, ...r }) => r);
    }
    const watched = req.user
      ? !!(await one('SELECT 1 FROM watchlist WHERE user_id = $1 AND set_num = $2', [req.user.id, setNum]))
      : false;
    // anonymous visitors: how many offers from members-only shops they are missing
    const hidden =
      audience === 'public'
        ? ((await one<{ n: number; shops: number }>(
            `SELECT count(*)::int AS n, count(DISTINCT o.shop_id)::int AS shops
               FROM offers o JOIN shops sh ON sh.id = o.shop_id
              WHERE o.set_num = $1 AND o.active AND o.in_stock AND sh.members_only`,
            [setNum],
          )) ?? { n: 0, shops: 0 })
        : { n: 0, shops: 0 };
    const used = listingsEnabledFor(req.user) ? await usedAdsForSet(setNum, req.user?.id ?? null) : [];
    return { set, offers, used, history, stats, deal, related, watched, hidden_offers: hidden.n, hidden_shops: hidden.shops };
  });

  app.get('/api/deals', async (req) => {
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(40).default(24) }).parse(req.query);
    const audience = audienceOf(req.user);
    const rows = await query(
      `SELECT d.day, d.rank, d.score, d.best_price_rsd, d.reference_price_rsd, d.reasons,
              s.set_num, s.name, s.theme_slug, t.name AS theme_name, s.image_url, s.rrp_rsd, s.age_min,
              o.shop_id AS best_shop, o.seller AS best_seller, o.url AS best_url, sh.name AS best_shop_name,
              (SELECT count(*)::int FROM ${offersFor(audience)} x WHERE x.set_num = s.set_num AND x.active AND x.in_stock) AS offers_in_stock
         FROM deals d
         JOIN sets s ON s.set_num = d.set_num
         LEFT JOIN themes t ON t.slug = s.theme_slug
         LEFT JOIN offers o ON o.id = d.best_offer_id
         LEFT JOIN shops sh ON sh.id = o.shop_id
        WHERE ${latestDeals(audience, 'd')}
        ORDER BY d.rank
        LIMIT $1`,
      [limit],
    );
    // `featured`: which of the top deals the home page highlights right now (rotates every few hours)
    return { day: rows[0]?.day ?? null, items: rows, featured: pickFeatured(rows as { set_num: string; score: string }[])?.set_num ?? null };
  });

  app.get('/api/themes', async (req) => {
    return query(
      `WITH avail AS (
         SELECT DISTINCT o.set_num FROM ${offersFor(audienceOf(req.user))} o WHERE o.active AND o.in_stock AND o.set_num IS NOT NULL
       )
       SELECT t.slug, t.name, count(s.set_num)::int AS count,
              (SELECT s2.image_url FROM sets s2 JOIN avail a2 ON a2.set_num = s2.set_num
                WHERE s2.theme_slug = t.slug AND s2.image_url IS NOT NULL
                ORDER BY s2.rrp_rsd DESC NULLS LAST LIMIT 1) AS image_url
         FROM themes t
         LEFT JOIN sets s ON s.theme_slug = t.slug AND s.set_num IN (SELECT set_num FROM avail)
        GROUP BY t.slug, t.name, t.sort_order
       HAVING count(s.set_num) > 0
        ORDER BY count(s.set_num) DESC, t.sort_order`,
    );
  });

  app.get('/api/shops', async (req) => {
    return query(
      `SELECT sh.id, sh.name, sh.url, sh.kind, sh.members_only,
              count(o.id) FILTER (WHERE o.in_stock AND o.set_num IS NOT NULL)::int AS offers_in_stock,
              count(DISTINCT o.seller) FILTER (WHERE o.in_stock AND o.seller <> '')::int AS sellers,
              (SELECT max(finished_at) FROM crawl_runs c WHERE c.shop_id = sh.id AND c.status = 'ok') AS last_crawl
         FROM shops sh LEFT JOIN offers o ON o.shop_id = sh.id AND o.active
        WHERE sh.enabled ${req.user ? '' : 'AND NOT sh.members_only'}
        GROUP BY sh.id ORDER BY sh.kind = 'official' DESC, sh.members_only, sh.name`,
    );
  });

  // the app's scanner: a box barcode or a set number → the set's page
  app.get<{ Params: { code: string } }>('/api/sets/by-code/:code', async (req, reply) => {
    const r = await setForCode(req.params.code.slice(0, 32));
    if (!r) return reply.code(404).send({ error: 'Ne prepoznajemo ovaj kod.' });
    return r;
  });

  app.get('/api/stats', async (req) => {
    const audience = audienceOf(req.user);
    const o = offersFor(audience);
    return one(
      `SELECT (SELECT count(DISTINCT set_num)::int FROM ${o} WHERE active AND in_stock AND set_num IS NOT NULL) AS sets_in_stock,
              (SELECT count(*)::int FROM ${o} WHERE active AND in_stock) AS offers_in_stock,
              (SELECT count(*)::int FROM shops WHERE enabled ${audience === 'members' ? '' : 'AND NOT members_only'}) AS shops,
              (SELECT count(DISTINCT seller)::int FROM ${o} WHERE active AND in_stock AND seller <> '') AS sellers,
              (SELECT max(finished_at) FROM crawl_runs WHERE status = 'ok') AS last_update,
              (SELECT count(*)::int FROM deals WHERE ${latestDeals(audience)}) AS deals_today,
              (SELECT count(*)::int FROM shops sh WHERE sh.enabled AND sh.members_only
                  AND EXISTS (SELECT 1 FROM offers x WHERE x.shop_id = sh.id AND x.active AND x.in_stock)) AS members_shops,
              (SELECT count(*)::int FROM offers x JOIN shops sh ON sh.id = x.shop_id
                WHERE sh.enabled AND sh.members_only AND x.active AND x.in_stock AND x.set_num IS NOT NULL) AS members_offers`,
    );
  });
}

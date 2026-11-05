import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { one, query, tx } from '../../db.js';
import { MAX_UPLOAD_BYTES, isImageName, readImage, saveUpload } from '../../listings/images.js';
import {
  AD_DAYS,
  MAX_ACTIVE_PER_USER,
  MAX_IMAGES,
  LISTING_SELECT,
  activeListings,
  dropFiles,
  listingsEnabledFor,
  loadListing,
  present,
  type ListingRow,
} from '../../listings/service.js';
import { notifyAdFollowers, notifySafely, notifySetWatchers } from '../../push/notify.js';
import { createLimiter } from '../auth.js';
import { requireUser } from './me.js';

const limits = {
  create: createLimiter(10, 24 * 3600_000),
  upload: createLimiter(60, 3600_000),
  phone: createLimiter(40, 3600_000),
  report: createLimiter(20, 24 * 3600_000),
};
const viewSeen = new Map<string, number>();

/** Oglasi can be switched off (LISTINGS_MODE); until then the whole feature answers 404 */
export async function gate(req: FastifyRequest, reply: FastifyReply) {
  if (!listingsEnabledFor(req.user)) return reply.code(404).send({ error: 'Nije pronađeno.' });
}

const SET_NUM = /^\d{3,7}(-\w+)?$/;
const year = new Date().getFullYear() + 1;
const text = (max: number, min = 0) => z.string().trim().min(min).max(max);
const adBody = z.object({
  title: text(100, 6),
  description: text(4000).default(''),
  set_num: z.string().trim().regex(SET_NUM).nullish(),
  theme_slug: text(80).nullish(),
  theme_name: text(80).nullish(),
  year: z.number().int().min(1949).max(year).nullish(),
  pieces: z.number().int().min(0).max(100_000).nullish(),
  minifigs: z.number().int().min(0).max(300).nullish(),
  condition: z.enum(['like_new', 'used_complete', 'used_incomplete', 'parts']),
  has_box: z.boolean(),
  has_manual: z.boolean(),
  price_rsd: z.number().int().min(1).max(10_000_000),
  negotiable: z.boolean().default(false),
  city: text(60, 2),
  shipping: z.enum(['pickup', 'ships']),
  images: z.array(z.coerce.number().int().positive()).min(1).max(MAX_IMAGES),
});
type AdBody = z.infer<typeof adBody>;

const FIELDS = ['title', 'description', 'set_num', 'theme_slug', 'theme_name', 'year', 'pieces', 'minifigs', 'condition', 'has_box', 'has_manual', 'negotiable', 'city', 'shipping'] as const;

async function ownedFreeImages(userId: number, ids: number[], listingId: number | null) {
  const rows = await query<{ id: number; listing_id: number | null }>('SELECT id, listing_id FROM listing_images WHERE id = ANY($1::bigint[]) AND user_id = $2', [ids, userId]);
  const ok = new Set(rows.filter((r) => r.listing_id === null || r.listing_id === listingId).map((r) => r.id));
  return ids.every((i) => ok.has(i)) && new Set(ids).size === ids.length;
}

/** Attaches the pictures in the given order; pictures that were on the ad and are no longer listed are deleted (rows and files) */
async function setImages(client: import('pg').PoolClient, userId: number, listingId: number, ids: number[]): Promise<string[]> {
  const gone = await query<{ file: string }>('DELETE FROM listing_images WHERE listing_id = $1 AND NOT (id = ANY($2::bigint[])) RETURNING file', [listingId, ids], client);
  for (const [i, id] of ids.entries()) await query('UPDATE listing_images SET listing_id = $2, position = $3 WHERE id = $1 AND user_id = $4', [id, listingId, i, userId], client);
  return gone.map((g) => g.file);
}

export async function listingRoutes(app: FastifyInstance) {
  // ---- pictures: raw upload (Content-Type: image/*), processed to a uniform 4:3 JPEG with the Kockolov stamp ----
  await app.register(async (up) => {
    up.addContentTypeParser(/^image\//, { parseAs: 'buffer', bodyLimit: MAX_UPLOAD_BYTES }, (_req, body, done) => done(null, body));
    up.post('/api/oglasi/slike', { preHandler: [gate, requireUser], bodyLimit: MAX_UPLOAD_BYTES }, async (req, reply) => {
      const userId = req.user!.id;
      if (limits.upload.hit(String(userId))) return reply.code(429).send({ error: 'Previše fotografija odjednom. Pokušaj malo kasnije.' });
      const pending = await one<{ n: number }>('SELECT count(*)::int AS n FROM listing_images WHERE user_id = $1 AND listing_id IS NULL', [userId]);
      if ((pending?.n ?? 0) >= 40) return reply.code(429).send({ error: 'Previše neiskorišćenih fotografija. Objavi oglas ili sačekaj dan.' });
      if (!Buffer.isBuffer(req.body) || !req.body.length) return reply.code(400).send({ error: 'Fotografija nedostaje.' });
      let file: string;
      try {
        file = await saveUpload(req.body);
      } catch {
        return reply.code(400).send({ error: 'Fotografiju nije moguće učitati. Probaj JPG ili PNG.' });
      }
      const row = await one<{ id: number }>('INSERT INTO listing_images (user_id, file) VALUES ($1, $2) RETURNING id', [userId, file]);
      return { id: row!.id, url: `/media/oglasi/${file}` };
    });
  });

  app.get<{ Params: { file: string } }>('/media/oglasi/:file', async (req, reply) => {
    if (!isImageName(req.params.file)) return reply.code(404).send('');
    try {
      return reply.type('image/jpeg').header('Cache-Control', 'public, max-age=31536000, immutable').header('X-Robots-Tag', 'noindex').send(await readImage(req.params.file));
    } catch {
      return reply.code(404).send('');
    }
  });

  // ---- reading ----
  app.get('/api/oglasi', { preHandler: gate }, async (req) => ({ items: (await activeListings(req.user?.id ?? null)).map((l) => present(l, req.user?.id ?? null)) }));

  app.get<{ Params: { id: string } }>('/api/oglasi/:id', { preHandler: gate }, async (req, reply) => {
    const id = Number(req.params.id);
    const l = Number.isSafeInteger(id) ? await loadListing(id, req.user?.id ?? null) : null;
    const mine = !!l && l.user_id === req.user?.id;
    // others see active ads and sold ones (marked "Prodato", so followers learn about it); the rest only their owner
    if (!l || (!mine && l.status !== 'active' && l.status !== 'sold')) return reply.code(404).send({ error: 'Oglas nije pronađen.' });
    if (!mine && l.status === 'active') {
      const key = `${req.user?.id ?? req.ip}:${id}`;
      const now = Date.now();
      if (viewSeen.size > 20000) for (const [k, t] of viewSeen) if (t < now) viewSeen.delete(k);
      if (!(viewSeen.get(key)! > now)) {
        viewSeen.set(key, now + 3600_000);
        await query('UPDATE listings SET views = views + 1 WHERE id = $1', [id]);
        l.views += 1;
      }
    }
    return present(l, req.user?.id ?? null);
  });

  /** The seller's phone, only for a signed-in user who asks for it (limited, so the numbers can't be harvested) */
  app.get<{ Params: { id: string } }>('/api/oglasi/:id/telefon', { preHandler: [gate, requireUser] }, async (req, reply) => {
    if (limits.phone.hit(String(req.user!.id))) return reply.code(429).send({ error: 'Previše zahteva. Pokušaj malo kasnije.' });
    const r = await one<{ phone: string | null }>(
      `SELECT u.phone FROM listings l JOIN users u ON u.id = l.user_id WHERE l.id = $1 AND l.status = 'active'
          AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE (b.blocker_id = l.user_id AND b.blocked_id = $2) OR (b.blocker_id = $2 AND b.blocked_id = l.user_id))`,
      [Number(req.params.id) || 0, req.user!.id],
    );
    if (!r?.phone) return reply.code(404).send({ error: 'Prodavac nije ostavio telefon.' });
    return { phone: r.phone };
  });

  app.get('/api/me/oglasi', { preHandler: [gate, requireUser] }, async (req) => {
    const rows = await query<ListingRow>(`${LISTING_SELECT} WHERE l.user_id = $1 AND l.status <> 'removed' ORDER BY l.created_at DESC`, [req.user!.id]);
    return { items: rows.map((l) => present(l, req.user!.id)) };
  });

  // ---- writing (a phone is optional: without one, buyers write through the site's messages) ----
  app.post('/api/oglasi', { preHandler: [gate, requireUser] }, async (req, reply) => {
    const userId = req.user!.id;
    const b = adBody.parse(req.body);
    if (limits.create.hit(String(userId))) return reply.code(429).send({ error: 'Danas si postavio dosta oglasa. Pokušaj sutra.' });
    const active = await one<{ n: number }>("SELECT count(*)::int AS n FROM listings WHERE user_id = $1 AND status IN ('active', 'paused')", [userId]);
    if ((active?.n ?? 0) >= MAX_ACTIVE_PER_USER) return reply.code(400).send({ error: `Najviše ${MAX_ACTIVE_PER_USER} aktivnih oglasa po nalogu.` });
    if (!(await ownedFreeImages(userId, b.images, null))) return reply.code(400).send({ error: 'Fotografije nisu ispravne. Otpremi ih ponovo.' });
    const id = await tx(async (c) => {
      const r = await one<{ id: number }>(
        `INSERT INTO listings (user_id, title, description, set_num, theme_slug, theme_name, year, pieces, minifigs, condition, has_box, has_manual, price_rsd, negotiable, city, shipping, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16, now() + make_interval(days => $17)) RETURNING id`,
        [userId, b.title, b.description, b.set_num ?? null, b.theme_slug ?? null, b.theme_name ?? null, b.year ?? null, b.pieces ?? null, b.minifigs ?? null, b.condition, b.has_box, b.has_manual, b.price_rsd, b.negotiable, b.city, b.shipping, AD_DAYS],
        c,
      );
      await setImages(c, userId, r!.id, b.images);
      return r!.id;
    });
    notifySafely(() => notifySetWatchers(id), (e) => req.log.error(e));
    return { id: String(id) };
  });

  async function ownOpen(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const l = await one<{ id: number; user_id: number; price_rsd: number; status: string }>('SELECT id, user_id, price_rsd, status FROM listings WHERE id = $1', [Number(req.params.id) || 0]);
    if (!l || l.user_id !== req.user!.id) return void reply.code(404).send({ error: 'Oglas nije pronađen.' });
    if (l.status === 'removed') return void reply.code(403).send({ error: 'Ovaj oglas je uklonjen. Pogledaj poruku moderatora ili nam piši.' });
    return l;
  }

  /** Edits the whole ad; a new price keeps the old one in the history and followers get "price dropped" */
  app.put<{ Params: { id: string } }>('/api/oglasi/:id', { preHandler: [gate, requireUser] }, async (req, reply) => {
    const l = await ownOpen(req, reply);
    if (!l) return;
    const b = adBody.parse(req.body);
    if (!(await ownedFreeImages(req.user!.id, b.images, l.id))) return reply.code(400).send({ error: 'Fotografije nisu ispravne. Otpremi ih ponovo.' });
    const gone = await tx(async (c) => {
      const vals = FIELDS.map((f) => (b as Record<string, unknown>)[f] ?? null);
      await query(`UPDATE listings SET ${FIELDS.map((f, i) => `${f} = $${i + 2}`).join(', ')}, updated_at = now() WHERE id = $1`, [l.id, ...vals], c);
      if (b.price_rsd !== l.price_rsd) {
        await query('INSERT INTO listing_prices (listing_id, price_rsd) VALUES ($1, $2)', [l.id, l.price_rsd], c);
        await query('UPDATE listings SET price_rsd = $2 WHERE id = $1', [l.id, b.price_rsd], c);
      }
      return setImages(c, req.user!.id, l.id, b.images);
    });
    await dropFiles(gone);
    if (b.price_rsd < l.price_rsd) notifySafely(() => notifyAdFollowers(l.id, 'price'), (e) => req.log.error(e));
    // a set number added later still tells the set's watchers (once)
    notifySafely(() => notifySetWatchers(l.id), (e) => req.log.error(e));
    return { id: String(l.id) };
  });

  app.patch<{ Params: { id: string } }>('/api/oglasi/:id/cena', { preHandler: [gate, requireUser] }, async (req, reply) => {
    const l = await ownOpen(req, reply);
    if (!l) return;
    const { price_rsd } = z.object({ price_rsd: z.number().int().min(1).max(10_000_000) }).parse(req.body);
    if (price_rsd !== l.price_rsd) {
      await tx(async (c) => {
        await query('INSERT INTO listing_prices (listing_id, price_rsd) VALUES ($1, $2)', [l.id, l.price_rsd], c);
        await query('UPDATE listings SET price_rsd = $2, updated_at = now() WHERE id = $1', [l.id, price_rsd], c);
      });
    }
    if (price_rsd < l.price_rsd) notifySafely(() => notifyAdFollowers(l.id, 'price'), (e) => req.log.error(e));
    return { ok: true };
  });

  app.patch<{ Params: { id: string } }>('/api/oglasi/:id/status', { preHandler: [gate, requireUser] }, async (req, reply) => {
    const l = await ownOpen(req, reply);
    if (!l) return;
    const { status } = z.object({ status: z.enum(['active', 'paused', 'sold']) }).parse(req.body);
    // putting an ad back on also gives it a fresh 30 days if its time ran out meanwhile
    await query(
      `UPDATE listings SET status = $2, updated_at = now(),
              expires_at = CASE WHEN $2 = 'active' AND expires_at < now() + interval '1 day' THEN now() + make_interval(days => $3) ELSE expires_at END,
              notified_stage = CASE WHEN $2 = 'active' AND expires_at < now() + interval '1 day' THEN 0 ELSE notified_stage END,
              expired_at = CASE WHEN $2 = 'active' THEN NULL ELSE expired_at END
        WHERE id = $1`,
      [l.id, status, AD_DAYS],
    );
    if (status === 'sold' && l.status !== 'sold') notifySafely(() => notifyAdFollowers(l.id, 'sold'), (e) => req.log.error(e));
    if (status === 'active') notifySafely(() => notifySetWatchers(l.id), (e) => req.log.error(e));
    return { ok: true };
  });

  /** "Produži": another 30 days; an ad that already expired becomes active again (the owner has 30 days for that) */
  app.post<{ Params: { id: string } }>('/api/oglasi/:id/obnovi', { preHandler: [gate, requireUser] }, async (req, reply) => {
    const l = await ownOpen(req, reply);
    if (!l) return;
    await query("UPDATE listings SET status = CASE WHEN status = 'expired' THEN 'active' ELSE status END, expires_at = now() + make_interval(days => $2), notified_stage = 0, expired_at = NULL, updated_at = now() WHERE id = $1", [l.id, AD_DAYS]);
    return { ok: true };
  });

  app.delete<{ Params: { id: string } }>('/api/oglasi/:id', { preHandler: [gate, requireUser] }, async (req, reply) => {
    const l = await ownOpen(req, reply);
    if (!l) return;
    const files = (await query<{ file: string }>('SELECT file FROM listing_images WHERE listing_id = $1', [l.id])).map((r) => r.file);
    await query('DELETE FROM listings WHERE id = $1', [l.id]);
    await dropFiles(files);
    return { ok: true };
  });

  // ---- following an ad: seen_price / seen_status are what the user was last shown ----
  app.put<{ Params: { id: string } }>('/api/oglasi/:id/prati', { preHandler: [gate, requireUser] }, async (req, reply) => {
    const r = await one(
      `INSERT INTO listing_watches (user_id, listing_id, seen_price, seen_status)
       SELECT $1, l.id, l.price_rsd, l.status FROM listings l WHERE l.id = $2 AND l.status IN ('active', 'sold') AND l.user_id <> $1
       ON CONFLICT DO NOTHING RETURNING listing_id`,
      [req.user!.id, Number(req.params.id) || 0],
    );
    const exists = r || (await one('SELECT 1 FROM listing_watches WHERE user_id = $1 AND listing_id = $2', [req.user!.id, Number(req.params.id) || 0]));
    if (!exists) return reply.code(404).send({ error: 'Oglas nije pronađen.' });
    return { ok: true, watched: true };
  });

  app.delete<{ Params: { id: string } }>('/api/oglasi/:id/prati', { preHandler: [gate, requireUser] }, async (req) => {
    await query('DELETE FROM listing_watches WHERE user_id = $1 AND listing_id = $2', [req.user!.id, Number(req.params.id) || 0]);
    return { ok: true, watched: false };
  });

  /** "U redu": the user has seen the change, so the notice goes away */
  app.post<{ Params: { id: string } }>('/api/oglasi/:id/prati/vidjeno', { preHandler: [gate, requireUser] }, async (req) => {
    await query(
      `UPDATE listing_watches w SET seen_price = l.price_rsd, seen_status = l.status FROM listings l
        WHERE l.id = w.listing_id AND w.user_id = $1 AND w.listing_id = $2`,
      [req.user!.id, Number(req.params.id) || 0],
    );
    return { ok: true };
  });

  app.get('/api/me/oglasi/pracenje', { preHandler: [gate, requireUser] }, async (req) => {
    const rows = await query<ListingRow & { seen_price: number; seen_status: string }>(
      `SELECT x.*, w.seen_price, w.seen_status FROM listing_watches w
         JOIN LATERAL (${LISTING_SELECT} WHERE l.id = w.listing_id) x ON true
        WHERE w.user_id = $1 AND x.status <> 'removed' ORDER BY w.created_at DESC`,
      [req.user!.id],
    );
    return {
      items: rows.map((r) => ({
        ...present(r, req.user!.id),
        seen_price: r.seen_price,
        notice: r.status === 'sold' && r.seen_status !== 'sold' ? 'sold' : r.price_rsd < r.seen_price ? 'drop' : r.price_rsd > r.seen_price ? 'rise' : null,
      })),
    };
  });

  // ---- reports ----
  app.post<{ Params: { id: string } }>('/api/oglasi/:id/prijava', { preHandler: [gate, requireUser] }, async (req, reply) => {
    const { reason } = z.object({ reason: text(500, 3) }).parse(req.body);
    if (limits.report.hit(String(req.user!.id))) return reply.code(429).send({ error: 'Previše prijava danas.' });
    const l = await one('SELECT 1 FROM listings WHERE id = $1', [Number(req.params.id) || 0]);
    if (!l) return reply.code(404).send({ error: 'Oglas nije pronađen.' });
    await query('INSERT INTO listing_reports (reporter_id, listing_id, reason) VALUES ($1, $2, $3)', [req.user!.id, Number(req.params.id), reason]);
    return { ok: true };
  });

  /** One cheap call for the badges: unread messages, followed ads with news, own active ads */
  app.get('/api/oglasi/status', { preHandler: [gate, requireUser] }, async (req) => {
    const r = await one<{ unread: number; notices: number; mine: number }>(
      `SELECT (SELECT count(*)::int FROM messages m JOIN conversations c ON c.id = m.conversation_id
                WHERE m.read_at IS NULL AND m.sender_id <> $1 AND $1 IN (c.buyer_id, c.seller_id)) AS unread,
              (SELECT count(*)::int FROM listing_watches w JOIN listings l ON l.id = w.listing_id
                WHERE w.user_id = $1 AND ((l.status = 'sold' AND w.seen_status <> 'sold') OR l.price_rsd <> w.seen_price)) AS notices,
              (SELECT count(*)::int FROM listings WHERE user_id = $1 AND status = 'active') AS mine`,
      [req.user!.id],
    );
    return r;
  });

}

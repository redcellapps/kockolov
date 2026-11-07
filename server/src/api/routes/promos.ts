import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { one, query } from '../../db.js';
import { runPromoCrawl } from '../../crawler/promos/run.js';

const KINDS = ['gift', 'sale', 'online_only', 'multi_buy', 'code', 'other'] as const;
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();

const editable = z.object({
  kind: z.enum(KINDS),
  title: z.string().trim().min(3).max(160),
  details: z.string().trim().max(1000),
  min_basket_rsd: z.number().int().min(0).max(10_000_000).nullable(),
  discount_pct: z.number().int().min(1).max(90).nullable(),
  themes: z.array(z.string().max(80)).max(12),
  valid_from: date,
  valid_until: date,
});

const COLUMNS = `p.id, p.shop_id, sh.name AS shop_name, p.kind, p.title, p.details, p.min_basket_rsd, p.discount_pct, p.themes,
                 to_char(p.valid_from, 'YYYY-MM-DD') AS valid_from, to_char(p.valid_until, 'YYYY-MM-DD') AS valid_until, p.source_url, p.source, p.status, p.changed, p.first_seen_at, p.last_seen_at`;

/**
 * Promotions. Visitors only ever get approved ones that are in force now. The crawler proposes, an admin decides.
 * Offers from members-only shops stay hidden from people who aren't signed in, like their prices.
 */
export async function promoRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (req, reply) => {
    if (!req.url.startsWith('/api/admin/akcije')) return;
    if (!req.user) return reply.code(401).send({ error: 'Potrebna je prijava.' });
    if (req.user.role !== 'admin') return reply.code(403).send({ error: 'Samo za administratore.' });
  });

  app.get('/api/akcije', async (req) => {
    const items = await query(
      `SELECT ${COLUMNS.replace(/, p\.source, p\.status, p\.changed, p\.first_seen_at, p\.last_seen_at/, '')}
         FROM promos p JOIN shops sh ON sh.id = p.shop_id
        WHERE p.status = 'approved' AND sh.enabled ${req.user ? '' : 'AND NOT sh.members_only'}
          AND (p.valid_from IS NULL OR p.valid_from <= current_date)
          AND (p.valid_until IS NULL OR p.valid_until >= current_date)
        ORDER BY sh.kind = 'official' DESC, sh.name, p.valid_until NULLS LAST, p.id`,
    );
    return { items };
  });

  app.get('/api/admin/akcije', async (req) => {
    const { status } = z.object({ status: z.enum(['pending', 'approved', 'rejected']).default('pending') }).parse(req.query);
    const items = await query(
      `SELECT ${COLUMNS} FROM promos p JOIN shops sh ON sh.id = p.shop_id
        WHERE p.status = $1 AND ($1 <> 'pending' OR p.valid_until IS NULL OR p.valid_until >= current_date) ORDER BY p.changed DESC, p.first_seen_at DESC, p.id DESC LIMIT 300`,
      [status],
    );
    const counts = await query<{ status: string; n: number }>('SELECT status, count(*)::int AS n FROM promos GROUP BY status');
    return { items, counts: Object.fromEntries(counts.map((c) => [c.status, c.n])) };
  });

  app.patch<{ Params: { id: string } }>('/api/admin/akcije/:id', async (req, reply) => {
    const id = Number(req.params.id) || 0;
    const body = editable.partial().extend({ status: z.enum(['pending', 'approved', 'rejected']).optional() }).parse(req.body ?? {});
    const current = await one<{ id: number }>('SELECT id FROM promos WHERE id = $1', [id]);
    if (!current) return reply.code(404).send({ error: 'Akcija ne postoji.' });
    const sets: string[] = [];
    const vals: unknown[] = [id];
    const add = (col: string, v: unknown) => {
      vals.push(v);
      sets.push(`${col} = $${vals.length}`);
    };
    for (const k of ['kind', 'title', 'details', 'min_basket_rsd', 'discount_pct', 'themes', 'valid_from', 'valid_until'] as const) {
      if (body[k] !== undefined) add(k, body[k]);
    }
    if (body.status) {
      add('status', body.status);
      sets.push('changed = false', 'reviewed_at = now()');
      add('reviewed_by', req.user!.id);
    }
    if (!sets.length) return { ok: true };
    try {
      await query(`UPDATE promos SET ${sets.join(', ')} WHERE id = $1`, vals);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') return reply.code(409).send({ error: 'Ista akcija već postoji.' });
      throw err;
    }
    return { ok: true };
  });

  app.post('/api/admin/akcije', async (req, reply) => {
    const body = editable.extend({ shop_id: z.string().max(40), source_url: z.string().url().max(500).optional() }).parse(req.body ?? {});
    const shop = await one<{ id: string; url: string }>('SELECT id, url FROM shops WHERE id = $1', [body.shop_id]);
    if (!shop) return reply.code(400).send({ error: 'Nepoznata prodavnica.' });
    try {
      const p = await one<{ id: number }>(
        `INSERT INTO promos (shop_id, kind, title, details, min_basket_rsd, discount_pct, themes, valid_from, valid_until, source_url, source, status, reviewed_at, reviewed_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'manual', 'approved', now(), $11) RETURNING id`,
        [shop.id, body.kind, body.title, body.details, body.min_basket_rsd, body.discount_pct, body.themes, body.valid_from, body.valid_until, body.source_url ?? shop.url, req.user!.id],
      );
      return { ok: true, id: p!.id };
    } catch (err) {
      if ((err as { code?: string }).code === '23505') return reply.code(409).send({ error: 'Ista akcija već postoji.' });
      throw err;
    }
  });

  app.delete<{ Params: { id: string } }>('/api/admin/akcije/:id', async (req, reply) => {
    const gone = await query('DELETE FROM promos WHERE id = $1 RETURNING id', [Number(req.params.id) || 0]);
    if (!gone.length) return reply.code(404).send({ error: 'Akcija ne postoji.' });
    return { ok: true };
  });

  /** Read the shops' promotion pages now instead of waiting for the morning run */
  app.post('/api/admin/akcije/preuzmi', async (req) => {
    const rows = await runPromoCrawl({ log: (m) => req.log.info(m) });
    return { rows };
  });
}

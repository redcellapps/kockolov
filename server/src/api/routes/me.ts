import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { one, query } from '../../db.js';
import { hashPassword, verifyPassword } from '../auth.js';
import { buildSearch } from '../search.js';

export async function requireUser(req: FastifyRequest, reply: FastifyReply) {
  if (!req.user) return reply.code(401).send({ error: 'Potrebna je prijava.' });
}

export async function meRoutes(app: FastifyInstance) {
  app.patch('/api/me', { preHandler: requireUser }, async (req) => {
    const body = z.object({ name: z.string().max(80).optional(), digestEnabled: z.boolean().optional() }).parse(req.body);
    await query(
      'UPDATE users SET name = coalesce($2, name), digest_enabled = coalesce($3, digest_enabled) WHERE id = $1',
      [req.user!.id, body.name ?? null, body.digestEnabled ?? null],
    );
    return { ok: true };
  });

  app.post('/api/me/password', { preHandler: requireUser }, async (req, reply) => {
    const body = z.object({ current: z.string(), next: z.string().min(8).max(200) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Nova lozinka mora imati bar 8 karaktera.' });
    const u = await one<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = $1', [req.user!.id]);
    if (!u || !(await verifyPassword(body.data.current, u.password_hash))) {
      return reply.code(400).send({ error: 'Trenutna lozinka nije ispravna.' });
    }
    await query('UPDATE users SET password_hash = $2 WHERE id = $1', [req.user!.id, await hashPassword(body.data.next)]);
    return { ok: true };
  });

  app.get('/api/me/watchlist', { preHandler: requireUser }, async (req) => {
    const nums = (await query<{ set_num: string }>('SELECT set_num FROM watchlist WHERE user_id = $1', [req.user!.id])).map(
      (r) => r.set_num,
    );
    if (!nums.length) return { items: [] };
    // reuse the search query so cards look identical everywhere
    const s = buildSearch({ setNums: nums, stock: false, sort: 'price_asc', size: 96 });
    const rows = await query(s.sql, s.params);
    return { items: rows.map(({ total, search_text, created_at, ...r }) => r) };
  });

  app.put<{ Params: { setNum: string } }>('/api/me/watchlist/:setNum', { preHandler: requireUser }, async (req, reply) => {
    const exists = await one('SELECT 1 FROM sets WHERE set_num = $1', [req.params.setNum]);
    if (!exists) return reply.code(404).send({ error: 'Set nije pronađen' });
    await query('INSERT INTO watchlist (user_id, set_num) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.user!.id, req.params.setNum]);
    return { ok: true, watched: true };
  });

  app.delete<{ Params: { setNum: string } }>('/api/me/watchlist/:setNum', { preHandler: requireUser }, async (req) => {
    await query('DELETE FROM watchlist WHERE user_id = $1 AND set_num = $2', [req.user!.id, req.params.setNum]);
    return { ok: true, watched: false };
  });
}

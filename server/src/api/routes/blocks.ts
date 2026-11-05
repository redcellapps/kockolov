import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { one, query } from '../../db.js';
import { gate } from './listings.js';
import { requireUser } from './me.js';

/** Who is meant: the seller of an ad, or the other person in one of my conversations (user ids never reach the web app) */
const target = z.union([z.object({ listing_id: z.coerce.number().int().positive() }), z.object({ conversation_id: z.coerce.number().int().positive() })]);

async function otherUser(req: FastifyRequest): Promise<number | null> {
  const me = req.user!.id;
  const t = target.parse(req.body);
  if ('listing_id' in t) return (await one<{ user_id: number }>('SELECT user_id FROM listings WHERE id = $1', [t.listing_id]))?.user_id ?? null;
  const c = await one<{ other: number }>('SELECT CASE WHEN buyer_id = $2 THEN seller_id ELSE buyer_id END AS other FROM conversations WHERE id = $1 AND $2 IN (buyer_id, seller_id)', [t.conversation_id, me]);
  return c?.other ?? null;
}

/**
 * Blocking another user: they can no longer write to me (or see my phone), and I no longer see their ads
 * or get notifications about them. They are not told. Unblocking from the same place or the account page.
 */
export async function blockRoutes(app: FastifyInstance) {
  app.post('/api/blokade', { preHandler: [gate, requireUser] }, async (req, reply) => {
    const other = await otherUser(req);
    if (!other) return reply.code(404).send({ error: 'Korisnik nije pronađen.' });
    if (other === req.user!.id) return reply.code(400).send({ error: 'Ne možeš da blokiraš sebe.' });
    await query('INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.user!.id, other]);
    return { ok: true, blocked: true };
  });

  app.delete('/api/blokade', { preHandler: [gate, requireUser] }, async (req, reply) => {
    const other = await otherUser(req);
    if (!other) return reply.code(404).send({ error: 'Korisnik nije pronađen.' });
    await query('DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2', [req.user!.id, other]);
    return { ok: true, blocked: false };
  });

  app.get('/api/me/blokade', { preHandler: [gate, requireUser] }, async (req) => {
    const items = await query<{ id: number; name: string; since: string }>(
      `SELECT b.id, coalesce(nullif(u.name, ''), 'Korisnik') AS name, b.created_at AS since
         FROM user_blocks b JOIN users u ON u.id = b.blocked_id WHERE b.blocker_id = $1 ORDER BY b.created_at DESC`,
      [req.user!.id],
    );
    return { items };
  });

  app.delete<{ Params: { id: string } }>('/api/me/blokade/:id', { preHandler: [gate, requireUser] }, async (req) => {
    await query('DELETE FROM user_blocks WHERE id = $1 AND blocker_id = $2', [Number(req.params.id) || 0, req.user!.id]);
    return { ok: true };
  });
}

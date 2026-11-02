import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { one, query } from '../../db.js';

/** Moderation of Oglasi: open reports, taking an ad down (with a reason the owner sees) and putting it back. Admin only (see the hook in admin.ts: /api/admin). */
export async function listingAdminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (req, reply) => {
    if (!req.url.startsWith('/api/admin/oglasi')) return;
    if (!req.user) return reply.code(401).send({ error: 'Potrebna je prijava.' });
    if (req.user.role !== 'admin') return reply.code(403).send({ error: 'Samo za administratore.' });
  });

  app.get('/api/admin/oglasi/prijave', async () => {
    const items = await query(
      `SELECT r.id, r.reason, r.created_at, r.resolved_at, r.conversation_id,
              l.id AS listing_id, l.title AS listing_title, l.status AS listing_status,
              ou.email AS owner_email, ru.email AS reporter_email
         FROM listing_reports r
         LEFT JOIN conversations c ON c.id = r.conversation_id
         LEFT JOIN listings l ON l.id = coalesce(r.listing_id, c.listing_id)
         LEFT JOIN users ou ON ou.id = l.user_id
         LEFT JOIN users ru ON ru.id = r.reporter_id
        WHERE r.resolved_at IS NULL ORDER BY r.created_at LIMIT 200`,
    );
    return { items };
  });

  /** A moderator reads a reported conversation (only the reported one) */
  app.get<{ Params: { id: string } }>('/api/admin/oglasi/razgovor/:id', async (req, reply) => {
    const reported = await one('SELECT 1 FROM listing_reports WHERE conversation_id = $1', [Number(req.params.id) || 0]);
    if (!reported) return reply.code(404).send({ error: 'Razgovor nije prijavljen.' });
    const messages = await query(
      `SELECT m.id, u.email AS sender, m.body AS text, m.created_at AS at FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.conversation_id = $1 ORDER BY m.id`,
      [Number(req.params.id)],
    );
    return { messages };
  });

  app.post<{ Params: { id: string } }>('/api/admin/oglasi/prijave/:id/reseno', async (req) => {
    await query('UPDATE listing_reports SET resolved_at = now() WHERE id = $1', [Number(req.params.id) || 0]);
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/api/admin/oglasi/:id/ukloni', async (req, reply) => {
    const { reason } = z.object({ reason: z.string().trim().min(3).max(300) }).parse(req.body);
    const id = Number(req.params.id) || 0;
    const r = await one("UPDATE listings SET status = 'removed', removed_reason = $2, updated_at = now() WHERE id = $1 RETURNING id", [id, reason]);
    if (!r) return reply.code(404).send({ error: 'Oglas nije pronađen.' });
    await query('UPDATE listing_reports SET resolved_at = now() WHERE listing_id = $1 AND resolved_at IS NULL', [id]);
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/api/admin/oglasi/:id/vrati', async (req, reply) => {
    const r = await one("UPDATE listings SET status = 'paused', removed_reason = NULL, updated_at = now() WHERE id = $1 AND status = 'removed' RETURNING id", [Number(req.params.id) || 0]);
    if (!r) return reply.code(404).send({ error: 'Oglas nije pronađen.' });
    return { ok: true };
  });
}

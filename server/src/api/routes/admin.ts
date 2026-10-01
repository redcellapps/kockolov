import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { one, query } from '../../db.js';
import { isCrawlRunning, runCrawl } from '../../crawler/pipeline.js';
import { refreshSets } from '../../crawler/refresh.js';
import { computeDeals } from '../../deals/engine.js';
import { sendLink } from '../invites.js';
import { hashPassword, normalizeEmail } from '../auth.js';

async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  if (!req.user) return reply.code(401).send({ error: 'Potrebna je prijava.' });
  if (req.user.role !== 'admin') return reply.code(403).send({ error: 'Samo za administratore.' });
}

export async function adminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (req, reply) => {
    if (req.url.startsWith('/api/admin')) return requireAdmin(req, reply);
  });

  app.get('/api/admin/overview', async () => {
    const runs = await query(
      `SELECT id, shop_id, started_at, finished_at, status, pages, items, matched, new_items, price_changes, deactivated, error
         FROM crawl_runs ORDER BY started_at DESC LIMIT 40`,
    );
    const shops = await query(
      `SELECT sh.id, sh.name, sh.enabled,
              count(o.id) FILTER (WHERE o.active)::int AS active_offers,
              count(o.id) FILTER (WHERE o.active AND o.set_num IS NULL AND o.match_method IS DISTINCT FROM 'merch')::int AS unmatched,
              count(o.id) FILTER (WHERE o.active AND o.match_method = 'merch')::int AS merch,
              count(o.id) FILTER (WHERE o.active AND o.match_method = 'name')::int AS name_matched
         FROM shops sh LEFT JOIN offers o ON o.shop_id = sh.id GROUP BY sh.id ORDER BY sh.id`,
    );
    const users = await one('SELECT count(*)::int AS count FROM users');
    return { runs, shops, users: users?.count ?? 0, crawlRunning: isCrawlRunning() };
  });

  app.get('/api/admin/unmatched', async (req) => {
    const { shop } = z.object({ shop: z.string().optional() }).parse(req.query);
    return query(
      `SELECT id, shop_id, seller, title, url, price_rsd, in_stock, match_method
         FROM offers WHERE active AND set_num IS NULL AND match_method IS DISTINCT FROM 'merch' ${shop ? 'AND shop_id = $1' : ''}
        ORDER BY in_stock DESC, price_rsd DESC LIMIT 300`,
      shop ? [shop] : [],
    );
  });

  app.post<{ Params: { id: string } }>('/api/admin/offers/:id/match', async (req, reply) => {
    const { setNum } = z.object({ setNum: z.string().regex(/^\d{3,7}(-\w+)?$/).nullable() }).parse(req.body);
    const offer = await one<{ id: number; title: string; image_url: string | null }>(
      'SELECT id, title, image_url FROM offers WHERE id = $1',
      [Number(req.params.id)],
    );
    if (!offer) return reply.code(404).send({ error: 'Ponuda nije pronađena' });
    if (setNum) {
      await query('INSERT INTO sets (set_num, name, image_url) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [
        setNum, offer.title, offer.image_url,
      ]);
    }
    await query("UPDATE offers SET set_num = $2, match_method = 'manual' WHERE id = $1", [offer.id, setNum]);
    await refreshSets(() => {});
    return { ok: true };
  });

  app.get('/api/admin/users', async () =>
    query(
      `SELECT u.id, u.email, u.name, u.role, u.digest_enabled, u.created_at, u.last_login_at, u.accepted_at, u.self_signup,
              (SELECT max(t.created_at) FROM user_tokens t WHERE t.user_id = u.id AND t.kind = 'invite') AS invited_at
         FROM users u ORDER BY u.created_at`,
    ),
  );

  // Adds the account and e-mails an invitation; the person sets their own password from the link.
  app.post('/api/admin/users', async (req, reply) => {
    const body = z
      .object({
        email: z.string().email(),
        name: z.string().max(80).optional(),
        role: z.enum(['user', 'admin']).default('user'),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Unesite ispravan e-mail.' });
    const email = normalizeEmail(body.data.email);
    if (await one('SELECT 1 FROM users WHERE email = $1', [email])) {
      return reply.code(409).send({ error: 'Korisnik sa ovim e-mailom već postoji.' });
    }
    // unusable random password until the invitation is accepted
    const user = await one<{ id: number }>(
      'INSERT INTO users (email, name, role, password_hash) VALUES ($1, $2, $3, $4) RETURNING id',
      [email, body.data.name ?? '', body.data.role, await hashPassword(randomBytes(24).toString('base64url'))],
    );
    const result = await sendLink(user!.id, { id: req.user!.id, name: req.user!.name });
    return { ok: true, email, ...result };
  });

  // Sends the invitation again (pending accounts) or a new-password link (accepted accounts).
  app.post<{ Params: { id: string } }>('/api/admin/users/:id/invite', async (req, reply) => {
    const id = Number(req.params.id);
    const u = await one<{ email: string }>('SELECT email FROM users WHERE id = $1', [id]);
    if (!u) return reply.code(404).send({ error: 'Korisnik ne postoji.' });
    const result = await sendLink(id, { id: req.user!.id, name: req.user!.name });
    return { ok: true, email: u.email, ...result };
  });

  app.delete<{ Params: { id: string } }>('/api/admin/users/:id', async (req, reply) => {
    const id = Number(req.params.id);
    if (id === req.user!.id) return reply.code(400).send({ error: 'Ne možete obrisati sopstveni nalog.' });
    await query('DELETE FROM users WHERE id = $1', [id]);
    return { ok: true };
  });

  app.post('/api/admin/crawl', async (req, reply) => {
    const { shops } = z.object({ shops: z.array(z.string()).optional() }).parse(req.body ?? {});
    if (isCrawlRunning()) return reply.code(409).send({ error: 'Preuzimanje cena je već u toku.' });
    runCrawl({ shops, log: (m) => req.log.info(m) }).catch((err) => req.log.error(err));
    return { ok: true, started: true };
  });

  app.post('/api/admin/deals', async () => {
    const deals = await computeDeals({ log: () => {} });
    return { ok: true, count: deals.length };
  });
}

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../../config.js';
import { one, tx } from '../../db.js';
import { hashToken, validLink } from '../invites.js';
import {
  createSession,
  destroySession,
  hashPassword,
  loginRateLimited,
  normalizeEmail,
  resetLoginAttempts,
  verifyPassword,
} from '../auth.js';

const credentials = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
});

export async function authRoutes(app: FastifyInstance) {
  app.get('/api/auth/me', async (req) => ({
    user: req.user ?? null,
    publicMode: config.PUBLIC_MODE,
    registrationOpen: config.registrationOpen,
  }));

  app.post('/api/auth/login', async (req, reply) => {
    const body = credentials.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Unesite ispravan e-mail i lozinku.' });
    const email = normalizeEmail(body.data.email);
    const key = `${req.ip}|${email}`;
    if (loginRateLimited(key)) return reply.code(429).send({ error: 'Previše pokušaja. Pokušajte ponovo za 10 minuta.' });
    const user = await one<{ id: number; password_hash: string }>('SELECT id, password_hash FROM users WHERE email = $1', [email]);
    const ok = user ? await verifyPassword(body.data.password, user.password_hash) : await verifyPassword('x', 'scrypt$16384$AAAA$AAAA');
    if (!user || !ok) return reply.code(401).send({ error: 'Pogrešan e-mail ili lozinka.' });
    resetLoginAttempts(key);
    await createSession(reply, user.id);
    return { ok: true };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    await destroySession(req, reply);
    return { ok: true };
  });

  app.post('/api/auth/register', async (req, reply) => {
    if (!config.registrationOpen) return reply.code(403).send({ error: 'Registracija trenutno nije otvorena.' });
    const body = credentials
      .extend({ password: z.string().min(8).max(200), name: z.string().max(80).optional() })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Lozinka mora imati bar 8 karaktera.' });
    const email = normalizeEmail(body.data.email);
    if (await one('SELECT 1 FROM users WHERE email = $1', [email])) {
      return reply.code(409).send({ error: 'Nalog sa ovim e-mailom već postoji.' });
    }
    const user = await one<{ id: number }>(
      'INSERT INTO users (email, name, password_hash, accepted_at) VALUES ($1, $2, $3, now()) RETURNING id',
      [email, body.data.name ?? '', await hashPassword(body.data.password)],
    );
    await createSession(reply, user!.id);
    return { ok: true };
  });

  // Invitation / new-password links (public: the person isn't logged in yet)
  const GONE = 'Ovaj link je istekao ili je već iskorišćen. Zatraži novi od administratora.';

  app.get<{ Params: { token: string } }>('/api/auth/invite/:token', async (req, reply) => {
    const link = await validLink(req.params.token);
    if (!link) return reply.code(410).send({ error: GONE });
    return { email: link.email, name: link.name, kind: link.kind };
  });

  app.post<{ Params: { token: string } }>('/api/auth/invite/:token', async (req, reply) => {
    const body = z.object({ password: z.string().min(8).max(200), name: z.string().max(80).optional() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Lozinka mora imati bar 8 karaktera.' });
    const passwordHash = await hashPassword(body.data.password);
    const userId = await tx(async (c) => {
      // claim the link atomically, so it can only be used once
      const t = await c.query(
        `UPDATE user_tokens SET used_at = now()
          WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() RETURNING user_id`,
        [hashToken(req.params.token)],
      );
      if (!t.rows.length) return null;
      const id = t.rows[0].user_id as number;
      await c.query(
        `UPDATE users SET password_hash = $2, name = coalesce(nullif($3, ''), name),
                accepted_at = coalesce(accepted_at, now()), last_login_at = now()
          WHERE id = $1`,
        [id, passwordHash, body.data.name?.trim() ?? ''],
      );
      // a new password signs out other sessions
      await c.query('DELETE FROM sessions WHERE user_id = $1', [id]);
      return id;
    });
    if (!userId) return reply.code(410).send({ error: GONE });
    await createSession(reply, userId);
    return { ok: true };
  });
}

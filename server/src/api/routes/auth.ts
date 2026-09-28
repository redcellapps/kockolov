import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../../config.js';
import { one } from '../../db.js';
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
      'INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id',
      [email, body.data.name ?? '', await hashPassword(body.data.password)],
    );
    await createSession(reply, user!.id);
    return { ok: true };
  });
}

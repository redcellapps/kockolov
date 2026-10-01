import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { config } from '../../config.js';
import { one, query, tx } from '../../db.js';
import { mailConfigured } from '../../mail/mailer.js';
import { hashToken, linkSentRecently, sendLink, validLink } from '../invites.js';
import {
  createLimiter,
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
const emailOnly = z.object({ email: z.string().email().max(200) });

// abuse protection for the public forms (per client IP, and per address for anything that sends mail)
export const limits = {
  registerIp: createLimiter(10, 60 * 60_000),
  mailIp: createLimiter(20, 60 * 60_000),
  mailAddress: createLimiter(5, 60 * 60_000),
};
const TOO_MANY = 'Previše pokušaja. Pokušaj ponovo malo kasnije.';
const MAIL_FAILED = 'Nismo uspeli da pošaljemo e-mail. Pokušaj ponovo za nekoliko minuta.';

export async function authRoutes(app: FastifyInstance) {
  /**
   * Mails a confirmation or new-password link. Without SMTP outside production the link is only
   * logged, so local sign-ups can still be finished; it is never returned to the browser.
   */
  async function mailLink(userId: number, kind: 'verify' | 'reset'): Promise<boolean> {
    const r = await sendLink(userId, null, kind);
    if (r.emailSent) return true;
    if (!mailConfigured() && !config.isProd) {
      app.log.warn(`SMTP nije podešen; link (${kind}) za korisnika ${userId}: ${r.link}`);
      return true;
    }
    app.log.error(`slanje linka (${kind}) korisniku ${userId} nije uspelo: ${r.error}`);
    return false;
  }

  function mailLimited(ip: string, email: string, reply: FastifyReply): boolean {
    if (limits.mailIp.hit(ip) || limits.mailAddress.hit(email)) {
      reply.code(429).send({ error: TOO_MANY });
      return true;
    }
    return false;
  }

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
    const user = await one<{ id: number; password_hash: string; accepted_at: string | null }>(
      'SELECT id, password_hash, accepted_at FROM users WHERE email = $1',
      [email],
    );
    const ok = user ? await verifyPassword(body.data.password, user.password_hash) : await verifyPassword('x', 'scrypt$16384$AAAA$AAAA');
    if (!user || !ok) return reply.code(401).send({ error: 'Pogrešan e-mail ili lozinka.' });
    resetLoginAttempts(key);
    if (!user.accepted_at) {
      // right password, but the address hasn't been confirmed yet
      return reply.code(403).send({ error: 'Prvo potvrdi e-mail adresu: otvori link koji smo ti poslali.', code: 'unconfirmed' });
    }
    await createSession(reply, user.id);
    return { ok: true };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    await destroySession(req, reply);
    return { ok: true };
  });

  /** Self sign-up: the account works once the address is confirmed through the e-mailed link. */
  app.post('/api/auth/register', async (req, reply) => {
    if (!config.registrationOpen) return reply.code(403).send({ error: 'Registracija trenutno nije otvorena.' });
    const body = credentials
      .extend({ password: z.string().min(8).max(200), name: z.string().max(80).optional() })
      .safeParse(req.body);
    if (!body.success) {
      const emailBad = body.error.issues.some((i) => i.path[0] === 'email');
      return reply.code(400).send({ error: emailBad ? 'Unesi ispravnu e-mail adresu.' : 'Lozinka mora imati bar 8 karaktera.' });
    }
    if (limits.registerIp.hit(req.ip)) return reply.code(429).send({ error: TOO_MANY });
    const email = normalizeEmail(body.data.email);
    const name = body.data.name?.trim() ?? '';
    const passwordHash = await hashPassword(body.data.password);
    const existing = await one<{ id: number; accepted_at: string | null }>('SELECT id, accepted_at FROM users WHERE email = $1', [email]);
    if (existing?.accepted_at) {
      return reply.code(409).send({ error: 'Nalog sa ovim e-mailom već postoji. Prijavi se ili zatraži novu lozinku.', code: 'exists' });
    }
    let userId: number;
    if (existing) {
      // nobody has confirmed this address yet, so the newest sign-up wins
      await query(
        `UPDATE users SET password_hash = $2, name = coalesce(nullif($3, ''), name), self_signup = true WHERE id = $1`,
        [existing.id, passwordHash, name],
      );
      userId = existing.id;
    } else {
      const u = await one<{ id: number }>(
        `INSERT INTO users (email, name, password_hash, self_signup) VALUES ($1, $2, $3, true) RETURNING id`,
        [email, name, passwordHash],
      );
      userId = u!.id;
    }
    // repeated clicks on "Registruj se" don't send a pile of e-mails
    if (!(await linkSentRecently(userId, 'verify'))) {
      if (limits.mailAddress.hit(email)) return reply.code(429).send({ error: TOO_MANY });
      if (!(await mailLink(userId, 'verify'))) return reply.code(502).send({ error: MAIL_FAILED });
    }
    return { ok: true, email };
  });

  /** New confirmation e-mail. Always answers the same, so it can't reveal who has an account. */
  app.post('/api/auth/resend', async (req, reply) => {
    const body = emailOnly.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Unesi ispravnu e-mail adresu.' });
    const email = normalizeEmail(body.data.email);
    if (mailLimited(req.ip, email, reply)) return;
    const u = await one<{ id: number }>('SELECT id FROM users WHERE email = $1 AND accepted_at IS NULL', [email]);
    if (u && !(await linkSentRecently(u.id, 'verify'))) {
      if (!(await mailLink(u.id, 'verify'))) return reply.code(502).send({ error: MAIL_FAILED });
    }
    return { ok: true };
  });

  /** Forgotten password: a short-lived new-password link. Same answer whether or not the account exists. */
  app.post('/api/auth/forgot', async (req, reply) => {
    const body = emailOnly.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Unesi ispravnu e-mail adresu.' });
    const email = normalizeEmail(body.data.email);
    if (mailLimited(req.ip, email, reply)) return;
    const u = await one<{ id: number }>('SELECT id FROM users WHERE email = $1', [email]);
    if (u && !(await linkSentRecently(u.id, 'reset'))) {
      if (!(await mailLink(u.id, 'reset'))) return reply.code(502).send({ error: MAIL_FAILED });
    }
    return { ok: true };
  });

  // One-time links from e-mails (public: the person isn't logged in yet)
  const GONE = 'Ovaj link je istekao ili je već iskorišćen.';

  app.get<{ Params: { token: string } }>('/api/auth/invite/:token', async (req, reply) => {
    const link = await validLink(req.params.token);
    if (!link) return reply.code(410).send({ error: GONE });
    return { email: link.email, name: link.name, kind: link.kind };
  });

  /** Invitation or new-password link: set the password and sign in. */
  app.post<{ Params: { token: string } }>('/api/auth/invite/:token', async (req, reply) => {
    const body = z.object({ password: z.string().min(8).max(200), name: z.string().max(80).optional() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Lozinka mora imati bar 8 karaktera.' });
    const passwordHash = await hashPassword(body.data.password);
    const userId = await tx(async (c) => {
      // claim the link atomically, so it can only be used once
      const t = await c.query(
        `UPDATE user_tokens SET used_at = now()
          WHERE token_hash = $1 AND kind IN ('invite', 'reset') AND used_at IS NULL AND expires_at > now() RETURNING user_id`,
        [hashToken(req.params.token)],
      );
      if (!t.rows.length) return null;
      const id = t.rows[0].user_id as number;
      // opening the link proves the address, so this also confirms a pending account
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

  /** Confirmation link from the sign-up e-mail: activates the account and signs in. */
  app.post<{ Params: { token: string } }>('/api/auth/verify/:token', async (req, reply) => {
    const userId = await tx(async (c) => {
      const t = await c.query(
        `UPDATE user_tokens SET used_at = now()
          WHERE token_hash = $1 AND kind = 'verify' AND used_at IS NULL AND expires_at > now() RETURNING user_id`,
        [hashToken(req.params.token)],
      );
      if (!t.rows.length) return null;
      const id = t.rows[0].user_id as number;
      await c.query('UPDATE users SET accepted_at = coalesce(accepted_at, now()) WHERE id = $1', [id]);
      return id;
    });
    if (!userId) return reply.code(410).send({ error: GONE });
    await createSession(reply, userId);
    return { ok: true };
  });
}

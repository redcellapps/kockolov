import { randomBytes, randomInt } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../../config.js';
import { one, query } from '../../db.js';
import { createDeviceSession, createLimiter, hashToken } from '../auth.js';
import { requireUser } from './me.js';

/**
 * Signing a Smart TV in without typing a password:
 *   1. the TV calls POST /api/tv/pair and shows the code (and a QR to /tv?kod=<code>)
 *   2. the user, signed in on kockolov.rs, confirms the code (POST /api/me/tv/confirm)
 *   3. the TV, polling GET /api/tv/pair/:code with its secret, receives a long-lived token
 * The secret keeps a code that someone glimpsed on a screen from being claimed by another device.
 */

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
const CODE_LENGTH = 6;
const PAIRING_MINUTES = 10;
const PLATFORMS = ['tizen', 'webos', 'browser'] as const;

export function makeCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

/** "k7p 3mx", "K7P-3MX" → "K7P3MX"; null when it can't be a code */
export function normalizeCode(raw: string): string | null {
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/0/g, 'O').replace(/1/g, 'I');
  return code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c)) ? code : null;
}

const DEVICE_NAMES: Record<string, string> = { tizen: 'Samsung TV', webos: 'LG TV', browser: 'Televizor (pregledač)' };

export async function tvRoutes(app: FastifyInstance) {
  const pairLimiter = createLimiter(20, 10 * 60_000); // new codes per IP
  const pollLimiter = createLimiter(600, 10 * 60_000); // polls per IP (one every ~3 s per TV)

  app.post('/api/tv/pair', async (req, reply) => {
    if (pairLimiter.hit(req.ip)) return reply.code(429).send({ error: 'Previše pokušaja. Pokušaj ponovo za nekoliko minuta.' });
    const body = z
      .object({ platform: z.enum(PLATFORMS).optional(), device: z.string().max(80).optional() })
      .safeParse(req.body ?? {});
    const platform = body.success ? body.data.platform : undefined;
    const deviceName = (body.success && body.data.device?.trim()) || (platform ? DEVICE_NAMES[platform] : null) || 'Televizor';
    const secret = randomBytes(24).toString('base64url');
    await query("DELETE FROM tv_pairings WHERE expires_at < now() - interval '1 day'");
    let code = makeCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      const inserted = await one(
        `INSERT INTO tv_pairings (code, secret_hash, platform, device_name, expires_at)
         VALUES ($1, $2, $3, $4, now() + ($5 || ' minutes')::interval)
         ON CONFLICT (code) DO NOTHING RETURNING code`,
        [code, hashToken(secret), platform ?? null, deviceName, String(PAIRING_MINUTES)],
      );
      if (inserted) break;
      code = makeCode();
    }
    const site = config.APP_URL.replace(/\/$/, '');
    return { code, secret, expiresIn: PAIRING_MINUTES * 60, url: `${site}/tv?kod=${code}` };
  });

  app.get<{ Params: { code: string }; Querystring: { secret?: string } }>('/api/tv/pair/:code', async (req, reply) => {
    if (pollLimiter.hit(req.ip)) return reply.code(429).send({ error: 'Previše pokušaja.' });
    const code = normalizeCode(req.params.code);
    const secret = req.query.secret ?? '';
    if (!code || !secret) return reply.code(404).send({ status: 'expired' });
    const p = await one<{ user_id: number | null; expired: boolean; claimed: boolean; device_name: string | null }>(
      `SELECT user_id, expires_at < now() AS expired, claimed_at IS NOT NULL AS claimed, device_name
         FROM tv_pairings WHERE code = $1 AND secret_hash = $2`,
      [code, hashToken(secret)],
    );
    if (!p || p.expired || p.claimed) return reply.code(404).send({ status: 'expired' });
    if (!p.user_id) return { status: 'pending' };
    // confirmed: hand out the token exactly once
    const claimed = await one('UPDATE tv_pairings SET claimed_at = now() WHERE code = $1 AND claimed_at IS NULL RETURNING code', [code]);
    if (!claimed) return reply.code(404).send({ status: 'expired' });
    const token = await createDeviceSession(p.user_id, 'tv', p.device_name);
    const user = await one<{ name: string; currency: string }>('SELECT name, currency FROM users WHERE id = $1', [p.user_id]);
    return { status: 'confirmed', token, user };
  });

  // the signed-in user types (or scans) the code on kockolov.rs/tv
  app.post('/api/me/tv/confirm', { preHandler: requireUser }, async (req, reply) => {
    const body = z.object({ code: z.string().max(20) }).safeParse(req.body);
    const code = body.success ? normalizeCode(body.data.code) : null;
    if (!code) return reply.code(400).send({ error: 'Kod ima 6 slova i brojeva, npr. K7P3MX.' });
    const p = await one<{ device_name: string | null }>(
      `UPDATE tv_pairings SET user_id = $2, confirmed_at = now()
        WHERE code = $1 AND expires_at > now() AND user_id IS NULL
        RETURNING device_name`,
      [code, req.user!.id],
    );
    if (!p) return reply.code(404).send({ error: 'Kod nije pronađen ili je istekao. Na televizoru zatraži novi kod.' });
    return { ok: true, device: p.device_name };
  });

  // devices signed in with a token (TVs, phones), for the account page
  app.get('/api/me/devices', { preHandler: requireUser }, async (req) => {
    const rows = await query<{ id: number; kind: string; device_name: string | null; created_at: string; last_used_at: string | null }>(
      `SELECT id, kind, device_name, created_at, last_used_at FROM sessions
        WHERE user_id = $1 AND kind IN ('tv', 'app') AND expires_at > now()
        ORDER BY created_at DESC`,
      [req.user!.id],
    );
    return { devices: rows };
  });

  app.delete<{ Params: { id: string } }>('/api/me/devices/:id', { preHandler: requireUser }, async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return reply.code(404).send({ error: 'Uređaj nije pronađen.' });
    await query("DELETE FROM sessions WHERE id = $1 AND user_id = $2 AND kind IN ('tv', 'app')", [id, req.user!.id]);
    return { ok: true };
  });
}

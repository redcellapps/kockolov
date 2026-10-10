import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { one, query } from '../db.js';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, keylen: number, opts: object) => Promise<Buffer>;
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export const SESSION_COOKIE = 'kl_session';

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64, SCRYPT);
  return `scrypt$${SCRYPT.N}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, saltB64, keyB64] = stored.split('$');
  if (algo !== 'scrypt' || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, { ...SCRYPT, N: Number(n) });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

export interface SessionUser {
  id: number;
  email: string;
  name: string;
  role: 'user' | 'admin';
  digest_enabled: boolean;
  news_enabled: boolean;
  currency: 'RSD' | 'EUR';
}

/** Header the Android/iOS app sends with every request; it signs in with a token instead of a cookie */
export const APP_HEADER = 'x-kockolov-app';
/** Response header carrying the new session's token to the app */
export const TOKEN_HEADER = 'x-kockolov-token';

/** The app's requests come from its own origin, where the site's cookie isn't kept (iPhone) */
export const isAppRequest = (req: FastifyRequest) => req.headers[APP_HEADER] !== undefined;

function bearer(req: FastifyRequest): string | undefined {
  const h = req.headers.authorization;
  return h?.startsWith('Bearer ') ? h.slice(7).trim() || undefined : undefined;
}

export async function createSession(reply: FastifyReply, userId: number): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const app = isAppRequest(reply.request);
  // the app stays signed in for a year; the site for SESSION_DAYS
  const expires = new Date(Date.now() + (app ? config.APP_SESSION_DAYS : config.SESSION_DAYS) * 86400_000);
  await query('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [hashToken(token), userId, expires]);
  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [userId]);
  if (app) {
    reply.header(TOKEN_HEADER, token);
    return;
  }
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.COOKIE_SECURE,
    expires,
  });
}

export async function destroySession(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = bearer(req) ?? req.cookies[SESSION_COOKIE];
  if (token) await query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

export async function userFromRequest(req: FastifyRequest): Promise<SessionUser | null> {
  const token = bearer(req) ?? req.cookies[SESSION_COOKIE];
  if (!token) return null;
  return one<SessionUser>(
    `SELECT u.id, u.email, u.name, u.role, u.digest_enabled, u.news_enabled, u.currency
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashToken(token)],
  );
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Tiny in-memory rate limiter: at most `max` hits per key within the window. One process serves
 * the site, so memory is enough; a restart simply starts the counts over.
 */
export function createLimiter(max: number, windowMs: number) {
  const hits = new Map<string, { count: number; until: number }>();
  return {
    /** Counts a hit; true when the key is over the limit. */
    hit(key: string): boolean {
      const now = Date.now();
      if (hits.size > 5000) for (const [k, v] of hits) if (v.until < now) hits.delete(k);
      const a = hits.get(key);
      if (!a || a.until < now) {
        hits.set(key, { count: 1, until: now + windowMs });
        return false;
      }
      a.count++;
      return a.count > max;
    },
    reset(key: string) {
      hits.delete(key);
    },
    clear() {
      hits.clear();
    },
  };
}

// login attempts per IP + e-mail
const loginLimiter = createLimiter(8, 10 * 60_000);
export function loginRateLimited(key: string): boolean {
  return loginLimiter.hit(key);
}
export function resetLoginAttempts(key: string) {
  loginLimiter.reset(key);
}

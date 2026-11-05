import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { config } from '../src/config.js';

const dbUrl = process.env.DATABASE_URL!;
const dbAvailable = await (async () => {
  const c = new pg.Client({ connectionString: dbUrl, connectionTimeoutMillis: 1500 });
  try {
    await c.connect();
    await c.end();
    return true;
  } catch {
    return false;
  }
})();

// Google answers for both checks: reCAPTCHA (siteverify) and the ID token (tokeninfo)
const google = vi.hoisted(() => ({ human: true, email: '', name: '' }));

describe.skipIf(!dbAvailable)('sign-in with the bot check and Google', () => {
  let app: Awaited<ReturnType<typeof import('../src/api/app.js').buildApp>>;
  let query: typeof import('../src/db.js').query;
  let one: typeof import('../src/db.js').one;
  let pool: typeof import('../src/db.js').pool;
  const realFetch = globalThis.fetch;

  beforeAll(async () => {
    const db = await import('../src/db.js');
    ({ query, one, pool } = db);
    await db.migrate();
    const { buildApp } = await import('../src/api/app.js');
    app = await buildApp();
    config.MAIL_DOMAIN_CHECK = false;
    config.RECAPTCHA_SECRET_KEY = 'secret';
    config.GOOGLE_CLIENT_ID = 'client.apps.googleusercontent.com';
    config.registrationOpen = true;
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('siteverify')) {
        return Response.json({ success: google.human, score: 0.9 }); // action is checked per route in botcheck.test.ts
      }
      if (url.includes('tokeninfo')) {
        return Response.json({
          aud: 'client.apps.googleusercontent.com',
          iss: 'https://accounts.google.com',
          email: google.email,
          email_verified: 'true',
          name: google.name,
          exp: String(Math.floor(Date.now() / 1000) + 600),
        });
      }
      return realFetch(input);
    }) as typeof fetch;
  });

  afterAll(async () => {
    globalThis.fetch = realFetch;
    await app?.close();
    await pool.end();
  });

  it('asks for the bot check after three wrong passwords, then lets the right one in', async () => {
    const email = `ivana-${Date.now()}@example.com`;
    const { hashPassword } = await import('../src/api/auth.js');
    await query(`INSERT INTO users (email, name, password_hash, accepted_at) VALUES ($1, 'Ivana', $2, now())`, [email, await hashPassword('tajna-lozinka')]);
    const wrong = (recaptcha?: string) =>
      app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: 'pogresno-1', recaptcha } });
    for (let i = 0; i < 3; i++) expect((await wrong()).statusCode).toBe(401);
    const blocked = await wrong();
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().code).toBe('captcha');
    google.human = false;
    expect((await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: 'tajna-lozinka', recaptcha: 'x' } })).statusCode).toBe(403);
    google.human = true;
    const ok = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: 'tajna-lozinka', recaptcha: 'x' } });
    expect(ok.statusCode).toBe(200);
  });

  it('creates an account from a Google sign-in and confirms an existing unconfirmed one, dropping its password', async () => {
    google.email = `google-${Date.now()}@gmail.com`;
    google.name = 'Nikola';
    const fresh = await app.inject({ method: 'POST', url: '/api/auth/google', payload: { credential: 'x'.repeat(30) } });
    expect(fresh.statusCode).toBe(200);
    const created = await one<{ accepted_at: string | null; name: string; self_signup: boolean }>(
      'SELECT accepted_at, name, self_signup FROM users WHERE email = $1',
      [google.email.toLowerCase()],
    );
    expect(created).toMatchObject({ name: 'Nikola', self_signup: true });
    expect(created!.accepted_at).not.toBeNull();

    // someone registered this address with their own password before the owner used Google
    const victim = `owner-${Date.now()}@gmail.com`;
    const reg = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: victim, password: 'napadac-lozinka', name: 'X', recaptcha: 'x' } });
    expect(reg.statusCode).toBe(200);
    google.email = victim;
    google.name = 'Vlasnik';
    expect((await app.inject({ method: 'POST', url: '/api/auth/google', payload: { credential: 'x'.repeat(30) } })).statusCode).toBe(200);
    const stolen = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: victim, password: 'napadac-lozinka' } });
    expect(stolen.statusCode).toBe(401);
  });

  it('a suspended account can\'t sign in, and its existing session stops working', async () => {
    const email = `suspendovan-${Date.now()}@example.com`;
    const { hashPassword } = await import('../src/api/auth.js');
    const u = await one<{ id: number }>(
      `INSERT INTO users (email, name, password_hash, accepted_at) VALUES ($1, 'Sima', $2, now()) RETURNING id`,
      [email, await hashPassword('tajna-lozinka')],
    );
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: 'tajna-lozinka', recaptcha: 'x' } });
    expect(login.statusCode).toBe(200);
    const cookie = login.cookies.find((c) => c.name === 'kl_session')!.value;
    await query('UPDATE users SET suspended_at = now() WHERE id = $1', [u!.id]);
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: `kl_session=${cookie}` } });
    expect(me.json().user).toBeNull();
    const again = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: 'tajna-lozinka', recaptcha: 'x' } });
    expect(again.statusCode).toBe(403);
    expect(again.json().code).toBe('suspended');
  });
});

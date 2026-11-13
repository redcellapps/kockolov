import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { countryOf } from '../src/lib/geo.js';

describe('countryOf', () => {
  it('finds the country of public addresses, IPv4 and IPv6', () => {
    expect(countryOf('77.46.150.10')).toBe('RS');
    expect(countryOf('8.8.8.8')).toBe('US');
    expect(countryOf('::ffff:77.46.150.10')).toBe('RS');
  });
  it('returns null for private, local and broken input', () => {
    for (const ip of ['127.0.0.1', '10.0.0.5', '172.18.0.4', '::1', 'nonsense', '', null, undefined]) expect(countryOf(ip)).toBeNull();
  });
});

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

describe.skipIf(!dbAvailable)('country of an account', () => {
  let app: Awaited<ReturnType<typeof import('../src/api/app.js').buildApp>>;
  let query: typeof import('../src/db.js').query;
  let one: typeof import('../src/db.js').one;
  let pool: typeof import('../src/db.js').pool;

  beforeAll(async () => {
    const db = await import('../src/db.js');
    ({ query, one, pool } = db);
    await db.migrate();
    const { buildApp } = await import('../src/api/app.js');
    const { hashPassword } = await import('../src/api/auth.js');
    app = await buildApp();
    await query("DELETE FROM users WHERE email = 'geo@example.com'");
    await query("INSERT INTO users (email, name, role, password_hash, accepted_at) VALUES ('geo@example.com', 'Geo', 'user', $1, now())", [
      await hashPassword('tajna-lozinka'),
    ]);
  });
  afterAll(async () => {
    await query("DELETE FROM users WHERE email = 'geo@example.com'");
    await app.close();
    await pool.end();
  });

  const login = (ip?: string) =>
    app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: ip ? { 'x-forwarded-for': ip } : {},
      payload: { email: 'geo@example.com', password: 'tajna-lozinka' },
    });

  it('stores the country code (not the address) at sign-in and follows the latest sign-in', async () => {
    expect((await login('77.46.150.10')).statusCode).toBe(200);
    expect(await one("SELECT country, country_at IS NOT NULL AS stamped FROM users WHERE email = 'geo@example.com'")).toEqual({ country: 'RS', stamped: true });
    expect((await login('8.8.8.8')).statusCode).toBe(200);
    expect((await one<{ country: string }>("SELECT country FROM users WHERE email = 'geo@example.com'"))!.country).toBe('US');
  });

  it('keeps the last known country when the address cannot be placed', async () => {
    expect((await login('10.1.2.3')).statusCode).toBe(200);
    expect((await one<{ country: string }>("SELECT country FROM users WHERE email = 'geo@example.com'"))!.country).toBe('US');
  });

  it('serves flags and refuses anything else', async () => {
    const ok = await app.inject({ method: 'GET', url: '/flags/rs.svg' });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['content-type']).toContain('image/svg+xml');
    expect(ok.body).toContain('<svg');
    expect((await app.inject({ method: 'GET', url: '/flags/..%2Fpackage.json' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/flags/zz.svg' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/flags/RS.svg' })).statusCode).toBe(404);
  });
});

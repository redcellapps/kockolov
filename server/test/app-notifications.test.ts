import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../src/config.js';
import { messagePush, newAdPush, ownerPush, wants, watchedAdPush } from '../src/push/notify.js';
import { fcmMessage } from '../src/push/fcm.js';

vi.mock('../src/mail/mailer.js', () => ({
  mailConfigured: () => true,
  accountFrom: () => 'Kockolov <nalog@example.com>',
  sendMail: async () => {},
  sendAccountMail: async () => {},
}));

describe('notification texts', () => {
  it('opens the right page, groups by tag and uses its own Android channel', () => {
    expect(messagePush({ conversationId: 7, from: 'Bob', adTitle: 'LEGO 75192 Millennium Falcon', text: 'Da li je\n još dostupno?' })).toEqual({
      title: 'Bob · LEGO 75192 Millennium Falcon',
      body: 'Da li je još dostupno?',
      url: '/poruke/7',
      tag: 'conv-7',
      channel: 'poruke',
    });
    expect(watchedAdPush({ id: 3, title: 'Zamak', kind: 'drop', price: '9.000 RSD', was: '10.000 RSD' })).toMatchObject({ url: '/oglasi/3', body: 'Sada 9.000 RSD, ranije 10.000 RSD.', channel: 'oglasi' });
    expect(watchedAdPush({ id: 3, title: 'Zamak', kind: 'sold' }).title).toBe('Prodato: Zamak');
    expect(newAdPush({ id: 4, setName: 'Millennium Falcon', setNum: '75192', price: '40.000 RSD', city: 'Niš', condition: 'like_new' }).body).toBe(
      '40.000 RSD · Niš · kao novo. Set je na tvojoj listi za praćenje.',
    );
    expect(ownerPush({ id: 5, title: 'Zamak', kind: 'expiring', daysLeft: 1 }).title).toBe('Oglas ističe sutra');
    expect(ownerPush({ id: 5, title: 'Zamak', kind: 'expiring', daysLeft: 3 }).title).toBe('Oglas ističe za 3 dana');
    expect(ownerPush({ id: 5, title: 'Zamak', kind: 'removed', reason: 'Nije LEGO' })).toMatchObject({ url: '/oglasi/5', body: '„Zamak”: Nije LEGO' });
    expect(fcmMessage('t', messagePush({ conversationId: 1, from: 'A', adTitle: 'B', text: 'C' })).message.android.notification.channel_id).toBe('poruke');
    expect(fcmMessage('t', { title: 'x', body: 'y', url: '/' }).message.android.notification.channel_id).toBe('cene');
    expect(wants({}, 'messages')).toBe(true);
    expect(wants({ messages: false }, 'messages')).toBe(false);
  });
});

const dbAvailable = await (async () => {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL!, connectionTimeoutMillis: 1500 });
  try {
    await c.connect();
    await c.end();
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!dbAvailable)('app 1.2: blocking and Oglasi notifications', async () => {
  const { pool, migrate, query, one } = await import('../src/db.js');
  const { buildApp } = await import('../src/api/app.js');
  const { hashPassword } = await import('../src/api/auth.js');
  const { setFcmSender } = await import('../src/push/fcm.js');
  const { settleNotifications } = await import('../src/push/notify.js');
  const { expireListings } = await import('../src/listings/service.js');
  let app: Awaited<ReturnType<typeof buildApp>>;
  const cookies: Record<string, string> = {};
  const ids: Record<string, number> = {};
  const as = (who: string) => ({ cookie: cookies[who] });
  const json = <T = any>(r: { body: string }) => JSON.parse(r.body) as T;
  /** what reached each phone: token → messages */
  const phones: { token: string; title: string; body: string; url: string; channel?: string }[] = [];
  const to = (who: string) => phones.filter((p) => p.token === `token-${who}`);

  const png = () => sharp({ create: { width: 800, height: 600, channels: 3, background: '#2266cc' } }).png().toBuffer();
  const post = async (who: string, over: Record<string, unknown> = {}) => {
    const pic = json(await app.inject({ method: 'POST', url: '/api/oglasi/slike', headers: { ...as(who), 'content-type': 'image/png' }, payload: await png() })).id;
    const r = await app.inject({
      method: 'POST',
      url: '/api/oglasi',
      headers: as(who),
      payload: { title: 'LEGO 10305 Lion Knights Castle', set_num: '10305', condition: 'like_new', has_box: true, has_manual: true, price_rsd: 30000, city: 'Niš', shipping: 'pickup', images: [pic], ...over },
    });
    expect(r.statusCode).toBe(200);
    await settleNotifications();
    return json(r).id as string;
  };

  beforeAll(async () => {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migrate(() => {});
    config.LISTINGS_MODE = 'on';
    config.LISTINGS_DIR = mkdtempSync(path.join(os.tmpdir(), 'kockolov-push-'));
    app = await buildApp({ logger: false });
    setFcmSender(async (token, msg) => {
      phones.push({ token, title: msg.title, body: msg.body, url: msg.url, channel: msg.channel });
      return { status: 200 };
    });
    await query("INSERT INTO sets (set_num, name) VALUES ('10305', 'Lion Knights'' Castle')");
    for (const who of ['ana', 'bora', 'cica']) {
      const u = await one<{ id: number }>("INSERT INTO users (email, name, role, password_hash, accepted_at) VALUES ($1, $2, 'user', $3, now()) RETURNING id", [
        `${who}@example.com`,
        who[0].toUpperCase() + who.slice(1),
        await hashPassword('tajna-lozinka'),
      ]);
      ids[who] = u!.id;
      const r = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: `${who}@example.com`, password: 'tajna-lozinka' } });
      cookies[who] = String(r.headers['set-cookie']).split(';')[0];
      // each has the app with notifications on
      await query("INSERT INTO push_subscriptions (user_id, kind, endpoint, platform) VALUES ($1, 'fcm', $2, 'android')", [u!.id, `token-${who}`]);
    }
  });
  beforeEach(() => void (phones.length = 0));
  afterAll(async () => {
    setFcmSender(null);
    await app?.close();
    await pool.end();
  });

  it('a new ad for a watched set reaches its watchers once, never the seller', async () => {
    await query('INSERT INTO watchlist (user_id, set_num) VALUES ($1, $2), ($3, $2), ($4, $2)', [ids.bora, '10305', ids.cica, ids.ana]);
    const id = await post('ana');
    expect(to('bora')).toHaveLength(1);
    expect(to('bora')[0]).toMatchObject({ title: "Novi oglas: Lion Knights' Castle (10305)", url: `/oglasi/${id}`, channel: 'oglasi' });
    expect(to('cica')).toHaveLength(1);
    expect(to('ana')).toHaveLength(0);
    // editing it again doesn't announce it a second time
    await app.inject({ method: 'PATCH', url: `/api/oglasi/${id}/status`, headers: as('ana'), payload: { status: 'paused' } });
    await app.inject({ method: 'PATCH', url: `/api/oglasi/${id}/status`, headers: as('ana'), payload: { status: 'active' } });
    await settleNotifications();
    expect(to('bora')).toHaveLength(1);
  });

  it('messages go to the phone every time, unless switched off', async () => {
    const id = (await one<{ id: number }>('SELECT id FROM listings WHERE user_id = $1', [ids.ana]))!.id;
    const r = await app.inject({ method: 'POST', url: `/api/oglasi/${id}/poruke`, headers: as('bora'), payload: { text: 'Da li je još dostupno?' } });
    const conv = json(r).conversation_id;
    await app.inject({ method: 'POST', url: `/api/poruke/${conv}`, headers: as('bora'), payload: { text: 'Mogu danas.' } });
    await settleNotifications();
    expect(to('ana').map((p) => p.body)).toEqual(['Da li je još dostupno?', 'Mogu danas.']);
    expect(to('ana')[0]).toMatchObject({ url: `/poruke/${conv}`, channel: 'poruke', title: 'Bora · LEGO 10305 Lion Knights Castle' });

    expect((await app.inject({ method: 'PATCH', url: '/api/me', headers: as('ana'), payload: { pushPrefs: { messages: false } } })).statusCode).toBe(200);
    expect(json(await app.inject({ method: 'GET', url: '/api/auth/me', headers: as('ana') })).user.push_prefs).toEqual({ messages: false });
    await app.inject({ method: 'POST', url: `/api/poruke/${conv}`, headers: as('bora'), payload: { text: 'Javi se.' } });
    await settleNotifications();
    expect(to('ana')).toHaveLength(2);
    await app.inject({ method: 'PATCH', url: '/api/me', headers: as('ana'), payload: { pushPrefs: { messages: true } } });
    // unknown kinds are refused
    expect((await app.inject({ method: 'PATCH', url: '/api/me', headers: as('ana'), payload: { pushPrefs: { spam: true } } })).statusCode).toBe(400);
  });

  it('followers hear about a real price drop once, and when the ad is sold', async () => {
    const id = (await one<{ id: number }>('SELECT id FROM listings WHERE user_id = $1', [ids.ana]))!.id;
    await app.inject({ method: 'PUT', url: `/api/oglasi/${id}/prati`, headers: as('cica') });
    const price = async (p: number) => {
      await app.inject({ method: 'PATCH', url: `/api/oglasi/${id}/cena`, headers: as('ana'), payload: { price_rsd: p } });
      await settleNotifications();
    };
    await price(29_950); // under the threshold
    expect(to('cica')).toHaveLength(0);
    await price(27_000);
    expect(to('cica')).toHaveLength(1);
    expect(to('cica')[0].body).toBe('Sada 27.000 RSD, ranije 30.000 RSD.');
    await price(30_000); // up again...
    await price(27_000); // ...and back down: nothing new
    expect(to('cica')).toHaveLength(1);
    await price(25_000);
    expect(to('cica')).toHaveLength(2);
    await app.inject({ method: 'PATCH', url: `/api/oglasi/${id}/status`, headers: as('ana'), payload: { status: 'sold' } });
    await settleNotifications();
    expect(to('cica').at(-1)!.title).toBe('Prodato: LEGO 10305 Lion Knights Castle');
    await app.inject({ method: 'PATCH', url: `/api/oglasi/${id}/status`, headers: as('ana'), payload: { status: 'active' } });
  });

  it('blocking: no messages either way, no phone, no ads, no notifications; unblocking from the account page', async () => {
    const id = (await one<{ id: number }>('SELECT id FROM listings WHERE user_id = $1', [ids.ana]))!.id;
    const conv = (await one<{ id: number }>('SELECT id FROM conversations WHERE buyer_id = $1', [ids.bora]))!.id;
    await query("UPDATE users SET phone = '+381 63 111 2222' WHERE id = $1", [ids.ana]);
    expect((await app.inject({ method: 'POST', url: '/api/blokade', headers: as('ana'), payload: { listing_id: id } })).statusCode).toBe(400); // yourself
    expect((await app.inject({ method: 'POST', url: '/api/blokade', headers: as('cica'), payload: { conversation_id: conv } })).statusCode).toBe(404); // not hers
    // Bora blocks Ana from the ad page
    expect((await app.inject({ method: 'POST', url: '/api/blokade', headers: as('bora'), payload: { listing_id: id } })).statusCode).toBe(200);

    expect(json(await app.inject({ method: 'GET', url: '/api/oglasi', headers: as('bora') })).items).toHaveLength(0);
    expect(json(await app.inject({ method: 'GET', url: '/api/oglasi', headers: as('cica') })).items).toHaveLength(1);
    expect(json(await app.inject({ method: 'GET', url: `/api/oglasi/${id}`, headers: as('bora') })).blocked).toBe(true);
    expect((await app.inject({ method: 'GET', url: `/api/oglasi/${id}/telefon`, headers: as('bora') })).statusCode).toBe(404);
    expect(json(await app.inject({ method: 'GET', url: '/api/poruke', headers: as('bora') })).items[0].blocked).toBe(true);
    expect(json(await app.inject({ method: 'GET', url: '/api/poruke', headers: as('ana') })).items[0].blocked).toBe(false); // she isn't told

    const tryAna = await app.inject({ method: 'POST', url: `/api/poruke/${conv}`, headers: as('ana'), payload: { text: 'Halo?' } });
    expect(tryAna.statusCode).toBe(403);
    expect(json(tryAna).error).toBe('Ne možeš da pošalješ poruku ovom korisniku.');
    expect((await app.inject({ method: 'POST', url: `/api/poruke/${conv}`, headers: as('bora'), payload: { text: 'x' } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: `/api/oglasi/${id}/poruke`, headers: as('bora'), payload: { text: 'x' } })).statusCode).toBe(403);

    // a new ad of Ana's for a set Bora watches: Cica hears about it, Bora doesn't
    await post('ana', { title: 'LEGO 10305 drugi primerak', price_rsd: 28000 });
    expect(to('cica')).toHaveLength(1);
    expect(to('bora')).toHaveLength(0);

    const list = json(await app.inject({ method: 'GET', url: '/api/me/blokade', headers: as('bora') })).items;
    expect(list).toEqual([expect.objectContaining({ name: 'Ana' })]);
    expect(JSON.stringify(list)).not.toContain('ana@example.com');
    expect((await app.inject({ method: 'DELETE', url: `/api/me/blokade/${list[0].id}`, headers: as('cica') })).statusCode).toBe(200); // not hers: nothing happens
    expect(json(await app.inject({ method: 'GET', url: '/api/me/blokade', headers: as('bora') })).items).toHaveLength(1);
    await app.inject({ method: 'DELETE', url: `/api/me/blokade/${list[0].id}`, headers: as('bora') });
    expect((await app.inject({ method: 'POST', url: `/api/poruke/${conv}`, headers: as('ana'), payload: { text: 'Halo?' } })).statusCode).toBe(200);
    expect(json(await app.inject({ method: 'GET', url: '/api/oglasi', headers: as('bora') })).items).toHaveLength(2);
    // and unblocking from the conversation works the same way
    await app.inject({ method: 'POST', url: '/api/blokade', headers: as('bora'), payload: { conversation_id: conv } });
    expect((await app.inject({ method: 'DELETE', url: '/api/blokade', headers: as('bora'), payload: { conversation_id: conv } })).statusCode).toBe(200);
    expect(await one('SELECT 1 FROM user_blocks')).toBeNull();
  });

  it('the owner hears when an ad runs out or a moderator takes it down', async () => {
    const id = (await one<{ id: number }>('SELECT id FROM listings WHERE user_id = $1 ORDER BY id LIMIT 1', [ids.ana]))!.id;
    await query("UPDATE listings SET expires_at = now() - interval '1 minute' WHERE id = $1", [id]);
    expect(await expireListings()).toBe(1);
    expect(to('ana')).toEqual([expect.objectContaining({ title: 'Oglas je istekao', url: '/moji-oglasi', channel: 'oglasi' })]);

    await query("UPDATE users SET role = 'admin' WHERE id = $1", [ids.cica]);
    const other = (await one<{ id: number }>('SELECT id FROM listings WHERE user_id = $1 AND id <> $2', [ids.ana, id]))!.id;
    expect((await app.inject({ method: 'POST', url: `/api/admin/oglasi/${other}/ukloni`, headers: as('cica'), payload: { reason: 'Nije LEGO set' } })).statusCode).toBe(200);
    await settleNotifications();
    expect(to('ana').at(-1)).toMatchObject({ title: 'Oglas je uklonjen', body: '„LEGO 10305 drugi primerak”: Nije LEGO set', url: `/oglasi/${other}` });
  });

  it('serves the App Links file only when the certificate is set', async () => {
    expect((await app.inject({ method: 'GET', url: '/.well-known/assetlinks.json' })).statusCode).toBe(404);
    const print = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, '0').toUpperCase()).join(':');
    config.ANDROID_CERT_SHA256 = `${print.toLowerCase()}, nije-otisak`;
    const r = await app.inject({ method: 'GET', url: '/.well-known/assetlinks.json' });
    expect(json(r)).toEqual([
      { relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: 'rs.kockolov.app', sha256_cert_fingerprints: [print] } },
    ]);
    config.ANDROID_CERT_SHA256 = undefined;
  });
});

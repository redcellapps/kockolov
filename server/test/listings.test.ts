import { existsSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { config } from '../src/config.js';

type Sent = { to: string; subject: string; text: string };
const mail = vi.hoisted(() => ({ on: true, sent: [] as Sent[] }));
vi.mock('../src/mail/mailer.js', () => ({
  mailConfigured: () => mail.on,
  accountFrom: () => 'Kockolov <nalog@example.com>',
  sendMail: async (m: Sent) => void mail.sent.push(m),
  sendAccountMail: async (m: Sent) => void mail.sent.push(m),
}));

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

describe.skipIf(!dbAvailable)('Oglasi: ads, pictures, following, messages, moderation', async () => {
  const { pool, migrate, query, one } = await import('../src/db.js');
  const { buildApp } = await import('../src/api/app.js');
  const { hashPassword } = await import('../src/api/auth.js');
  const { expireListings } = await import('../src/listings/service.js');
  let app: Awaited<ReturnType<typeof buildApp>>;
  const cookies: Record<string, string> = {};
  const as = (who: string) => ({ cookie: cookies[who] });

  const png = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: '#cc2222' } }).png().toBuffer();
  const upload = async (who: string, body: Buffer, type = 'image/png') =>
    app.inject({ method: 'POST', url: '/api/oglasi/slike', headers: { ...as(who), 'content-type': type }, payload: body });
  const ad = (images: number[], over: Record<string, unknown> = {}) => ({
    title: 'LEGO 75192 Millennium Falcon',
    description: 'Kompletan, sa kutijom.',
    set_num: '75192',
    theme_name: 'Star Wars',
    year: 2017,
    pieces: 7541,
    minifigs: 8,
    condition: 'used_complete',
    has_box: true,
    has_manual: true,
    price_rsd: 40000,
    negotiable: true,
    city: 'Niš',
    shipping: 'pickup',
    images,
    ...over,
  });
  const json = <T = any>(r: { body: string }) => JSON.parse(r.body) as T;
  let adId = '';
  let imgId = 0;

  beforeAll(async () => {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migrate(() => {});
    config.LISTINGS_MODE = 'on';
    config.LISTINGS_DIR = mkdtempSync(path.join(os.tmpdir(), 'kockolov-listings-'));
    app = await buildApp({ logger: false });
    for (const [who, role] of [['alice', 'user'], ['bob', 'user'], ['admin', 'admin']] as const) {
      await query("INSERT INTO users (email, name, role, password_hash, accepted_at) VALUES ($1, $2, $3, $4, now())", [`${who}@example.com`, who[0].toUpperCase() + who.slice(1), role, await hashPassword('tajna-lozinka')]);
      const r = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: `${who}@example.com`, password: 'tajna-lozinka' } });
      cookies[who] = String(r.headers['set-cookie']).split(';')[0];
    }
  });
  afterAll(async () => {
    await app?.close();
    await pool.end();
  });

  it('is hidden until LISTINGS_MODE allows it', async () => {
    config.LISTINGS_MODE = 'off';
    expect((await app.inject({ method: 'GET', url: '/api/oglasi', headers: as('alice') })).statusCode).toBe(404);
    config.LISTINGS_MODE = 'admins';
    expect((await app.inject({ method: 'GET', url: '/api/oglasi', headers: as('alice') })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/oglasi', headers: as('admin') })).statusCode).toBe(200);
    expect(json((await app.inject({ method: 'GET', url: '/api/auth/me', headers: as('alice') }))).listings).toBe(false);
    expect(json((await app.inject({ method: 'GET', url: '/api/auth/me', headers: as('admin') }))).listings).toBe(true);
    config.LISTINGS_MODE = 'on';
    expect(json((await app.inject({ method: 'GET', url: '/api/auth/me', headers: as('alice') }))).listings).toBe(true);
  });

  it('turns any photo into a uniform 1200×900 JPEG with the stamp, and accepts a valid phone', async () => {
    const bad = await upload('alice', Buffer.from('not a picture'));
    expect(bad.statusCode).toBe(400);
    const r = await upload('alice', await png(600, 900)); // portrait
    expect(r.statusCode).toBe(200);
    imgId = json(r).id;
    const file = await app.inject({ method: 'GET', url: json(r).url });
    expect(file.headers['content-type']).toBe('image/jpeg');
    const meta = await sharp(file.rawPayload).metadata();
    expect([meta.width, meta.height, meta.format, meta.exif]).toEqual([1200, 900, 'jpeg', undefined]);
    // the corner carries the stamp (dark pill over the backdrop), the middle shows the photo
    const px = async (x: number, y: number) => (await sharp(file.rawPayload).extract({ left: x, top: y, width: 1, height: 1 }).raw().toBuffer()).toJSON().data;
    expect((await px(600, 450))[0]).toBeGreaterThan(150); // red photo in the middle
    expect((await px(1100, 860))[0]).toBeLessThan(120); // stamp pill, dark

    expect((await app.inject({ method: 'PATCH', url: '/api/me', headers: as('alice'), payload: { phone: 'abc' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PATCH', url: '/api/me', headers: as('alice'), payload: { phone: '+381 63 805 2042' } })).statusCode).toBe(200);
  });

  it('validates the ad and only accepts your own unused pictures', async () => {
    const other = json(await upload('bob', await png(800, 600))).id;
    const post = (payload: object, who = 'alice') => app.inject({ method: 'POST', url: '/api/oglasi', headers: as(who), payload });
    expect((await post(ad([imgId], { price_rsd: 0 }))).statusCode).toBe(400);
    expect((await post(ad([imgId], { title: 'x' }))).statusCode).toBe(400);
    expect((await post(ad([]))).statusCode).toBe(400);
    expect((await post(ad([imgId, imgId]))).statusCode).toBe(400);
    expect((await post(ad([other]))).statusCode).toBe(400); // bob's picture
    const ok = await post(ad([imgId]));
    expect(ok.statusCode).toBe(200);
    adId = json(ok).id;
    expect((await post(ad([imgId]))).statusCode).toBe(400); // already attached to the first ad
    await query('DELETE FROM listing_images WHERE user_id = (SELECT id FROM users WHERE email = $1)', ['bob@example.com']);
  });

  it('lets a seller post without a phone: buyers then only get the messages', async () => {
    const pic = json(await upload('bob', await png(800, 600))).id;
    const posted = await app.inject({ method: 'POST', url: '/api/oglasi', headers: as('bob'), payload: ad([pic]) });
    expect(posted.statusCode).toBe(200);
    const id = json(posted).id;
    const detail = json(await app.inject({ method: 'GET', url: `/api/oglasi/${id}`, headers: as('alice') }));
    expect(detail.has_phone).toBe(false);
    expect((await app.inject({ method: 'GET', url: `/api/oglasi/${id}/telefon`, headers: as('alice') })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/api/oglasi/${id}`, headers: as('bob') })).statusCode).toBe(200);
  });

  it('lists active ads without the seller\'s phone, and gives the phone only on request', async () => {
    const list = await app.inject({ method: 'GET', url: '/api/oglasi', headers: as('bob') });
    const items = json(list).items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: adId, seller: 'Alice', has_phone: true, mine: false, watched: false, set_num: '75192' });
    expect(list.body).not.toContain('805 2042');
    expect(list.body).not.toContain('alice@example.com');
    expect(items[0].images[0]).toMatch(/^\/media\/oglasi\/[a-f0-9]{24}\.jpg$/);
    expect((await app.inject({ method: 'GET', url: `/api/oglasi/${adId}/telefon`, headers: as('bob') })).body).toContain('+381 63 805 2042');
    const mine = json(await app.inject({ method: 'GET', url: `/api/oglasi/${adId}`, headers: as('alice') }));
    expect(mine.mine).toBe(true);
    expect(mine.expires_at).toBeTruthy();
    // views: the owner doesn't count, a buyer counts once an hour
    await app.inject({ method: 'GET', url: `/api/oglasi/${adId}`, headers: as('bob') });
    await app.inject({ method: 'GET', url: `/api/oglasi/${adId}`, headers: as('bob') });
    expect((await one('SELECT views FROM listings WHERE id = $1', [adId]))!.views).toBe(1);
  });

  it('edits the whole ad (only the owner), keeps the price history, and followers hear about a drop', async () => {
    const edit = { ...ad([imgId]), title: 'LEGO 75192 Millennium Falcon, kompletan u kutiji', price_rsd: 36000, city: 'Beograd' };
    expect((await app.inject({ method: 'PUT', url: `/api/oglasi/${adId}`, headers: as('bob'), payload: edit })).statusCode).toBe(404);
    expect((await app.inject({ method: 'PUT', url: `/api/oglasi/${adId}/prati`, headers: as('alice') })).statusCode).toBe(404); // not your own ad
    expect((await app.inject({ method: 'PUT', url: `/api/oglasi/${adId}/prati`, headers: as('bob') })).statusCode).toBe(200);
    expect(json(await app.inject({ method: 'GET', url: '/api/me/oglasi/pracenje', headers: as('bob') })).items[0].notice).toBeNull();

    expect((await app.inject({ method: 'PUT', url: `/api/oglasi/${adId}`, headers: as('alice'), payload: edit })).statusCode).toBe(200);
    const d = json(await app.inject({ method: 'GET', url: `/api/oglasi/${adId}`, headers: as('bob') }));
    expect(d).toMatchObject({ title: edit.title, price_rsd: 36000, city: 'Beograd', watched: true });
    expect(d.price_history.map((p: { price: number }) => p.price)).toEqual([40000]);

    expect(json(await app.inject({ method: 'GET', url: '/api/oglasi/status', headers: as('bob') })).notices).toBe(1);
    const w = json(await app.inject({ method: 'GET', url: '/api/me/oglasi/pracenje', headers: as('bob') })).items[0];
    expect(w).toMatchObject({ notice: 'drop', seen_price: 40000 });
    await app.inject({ method: 'POST', url: `/api/oglasi/${adId}/prati/vidjeno`, headers: as('bob') });
    expect(json(await app.inject({ method: 'GET', url: '/api/me/oglasi/pracenje', headers: as('bob') })).items[0].notice).toBeNull();

    // quick price change too, and replacing the pictures deletes the old file
    expect((await app.inject({ method: 'PATCH', url: `/api/oglasi/${adId}/cena`, headers: as('alice'), payload: { price_rsd: 35000 } })).statusCode).toBe(200);
    const old = await one<{ file: string }>('SELECT file FROM listing_images WHERE id = $1', [imgId]);
    const fresh = json(await upload('alice', await png(900, 600))).id;
    expect((await app.inject({ method: 'PUT', url: `/api/oglasi/${adId}`, headers: as('alice'), payload: { ...edit, price_rsd: 35000, images: [fresh] } })).statusCode).toBe(200);
    expect(existsSync(path.join(config.LISTINGS_DIR, old!.file))).toBe(false);
    imgId = fresh;
  });

  it('messages: a buyer writes, the seller gets one throttled e-mail and an unread count, both can answer', async () => {
    mail.sent.length = 0;
    expect((await app.inject({ method: 'POST', url: `/api/oglasi/${adId}/poruke`, headers: as('alice'), payload: { text: 'sam sebi' } })).statusCode).toBe(400);
    const first = await app.inject({ method: 'POST', url: `/api/oglasi/${adId}/poruke`, headers: as('bob'), payload: { text: 'Da li je još dostupno?' } });
    expect(first.statusCode).toBe(200);
    const conv = json(first).conversation_id;
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]).toMatchObject({ to: 'alice@example.com' });
    expect(mail.sent[0].subject).toContain('Bob ti je poslao poruku');
    expect(mail.sent[0].text).toContain(`/poruke/${conv}`);
    // a second message soon after: no second e-mail
    await app.inject({ method: 'POST', url: `/api/poruke/${conv}`, headers: as('bob'), payload: { text: 'Mogu u subotu.' } });
    expect(mail.sent).toHaveLength(1);

    expect(json(await app.inject({ method: 'GET', url: '/api/oglasi/status', headers: as('alice') })).unread).toBe(2);
    const inbox = json(await app.inject({ method: 'GET', url: '/api/poruke', headers: as('alice') })).items;
    expect(inbox[0]).toMatchObject({ id: conv, other: 'Bob', my_ad: true, unread: 2, last: { text: 'Mogu u subotu.', mine: false } });
    expect((await app.inject({ method: 'GET', url: `/api/poruke/${conv}`, headers: as('admin') })).statusCode).toBe(404); // not a participant
    const thread = json(await app.inject({ method: 'GET', url: `/api/poruke/${conv}`, headers: as('alice') }));
    expect(thread.messages.map((m: { text: string; mine: boolean }) => [m.text, m.mine])).toEqual([['Da li je još dostupno?', false], ['Mogu u subotu.', false]]);
    expect(json(await app.inject({ method: 'GET', url: '/api/oglasi/status', headers: as('alice') })).unread).toBe(0);

    const reply = await app.inject({ method: 'POST', url: `/api/poruke/${conv}`, headers: as('alice'), payload: { text: 'Može, subota u 11.' } });
    expect(reply.statusCode).toBe(200);
    expect(mail.sent.at(-1)).toMatchObject({ to: 'bob@example.com' });
    expect(json(await app.inject({ method: 'GET', url: '/api/oglasi/status', headers: as('bob') })).unread).toBe(1);

    // after the window the next message mails again, unless the person switched e-mails off
    await query("UPDATE conversations SET seller_mailed_at = now() - interval '20 minutes'");
    await app.inject({ method: 'POST', url: `/api/poruke/${conv}`, headers: as('bob'), payload: { text: 'Hvala!' } });
    expect(mail.sent.filter((m) => m.to === 'alice@example.com')).toHaveLength(2);
    await app.inject({ method: 'PATCH', url: '/api/me', headers: as('alice'), payload: { msgEmailEnabled: false } });
    await query("UPDATE conversations SET seller_mailed_at = now() - interval '20 minutes'");
    await app.inject({ method: 'POST', url: `/api/poruke/${conv}`, headers: as('bob'), payload: { text: 'Još jedna.' } });
    expect(mail.sent.filter((m) => m.to === 'alice@example.com')).toHaveLength(2);
    // a failing mailer never fails the message
    mail.on = false;
    expect((await app.inject({ method: 'POST', url: `/api/poruke/${conv}`, headers: as('bob'), payload: { text: 'Bez mejla.' } })).statusCode).toBe(200);
    mail.on = true;
  });

  it('reports go to a moderator, who can take an ad down with a reason and put it back', async () => {
    expect((await app.inject({ method: 'POST', url: `/api/oglasi/${adId}/prijava`, headers: as('bob'), payload: { reason: 'Sumnjiv oglas' } })).statusCode).toBe(200);
    const conv = (await one<{ id: number }>('SELECT id FROM conversations'))!.id;
    expect((await app.inject({ method: 'POST', url: `/api/poruke/${conv}/prijava`, headers: as('alice'), payload: {} })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/admin/oglasi/prijave', headers: as('bob') })).statusCode).toBe(403);
    const reports = json(await app.inject({ method: 'GET', url: '/api/admin/oglasi/prijave', headers: as('admin') })).items;
    expect(reports).toHaveLength(2);
    expect(json(await app.inject({ method: 'GET', url: `/api/admin/oglasi/razgovor/${conv}`, headers: as('admin') })).messages.length).toBeGreaterThan(2);

    expect((await app.inject({ method: 'POST', url: `/api/admin/oglasi/${adId}/ukloni`, headers: as('admin'), payload: { reason: 'Nije LEGO' } })).statusCode).toBe(200);
    expect(json(await app.inject({ method: 'GET', url: '/api/oglasi', headers: as('bob') })).items).toHaveLength(0);
    expect((await app.inject({ method: 'GET', url: `/api/oglasi/${adId}`, headers: as('bob') })).statusCode).toBe(404);
    expect((await app.inject({ method: 'PUT', url: `/api/oglasi/${adId}`, headers: as('alice'), payload: ad([imgId]) })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: `/api/oglasi/${adId}/poruke`, headers: as('bob'), payload: { text: 'još tu?' } })).statusCode).toBe(404);
    expect(json(await app.inject({ method: 'GET', url: '/api/admin/oglasi/prijave', headers: as('admin') })).items).toHaveLength(1); // the conversation report is still open
    expect((await app.inject({ method: 'GET', url: '/api/admin/oglasi/uklonjeni', headers: as('bob') })).statusCode).toBe(403);
    const gone = json(await app.inject({ method: 'GET', url: '/api/admin/oglasi/uklonjeni', headers: as('admin') })).items;
    expect(gone).toHaveLength(1);
    expect(gone[0].removed_reason).toBe('Nije LEGO');
    expect((await app.inject({ method: 'POST', url: `/api/admin/oglasi/${adId}/vrati`, headers: as('admin') })).statusCode).toBe(200);
    expect(json(await app.inject({ method: 'GET', url: '/api/admin/oglasi/uklonjeni', headers: as('admin') })).items).toHaveLength(0);
    expect((await one('SELECT status FROM listings WHERE id = $1', [adId]))!.status).toBe('paused');
  });

  it('pausing, selling, renewing and expiring', async () => {
    const st = (status: string) => app.inject({ method: 'PATCH', url: `/api/oglasi/${adId}/status`, headers: as('alice'), payload: { status } });
    await st('active');
    expect(json(await app.inject({ method: 'GET', url: '/api/oglasi', headers: as('bob') })).items).toHaveLength(1);
    await st('paused');
    expect(json(await app.inject({ method: 'GET', url: '/api/oglasi', headers: as('bob') })).items).toHaveLength(0);
    expect((await app.inject({ method: 'GET', url: `/api/oglasi/${adId}`, headers: as('bob') })).statusCode).toBe(404);
    await st('active');
    await app.inject({ method: 'PUT', url: `/api/oglasi/${adId}/prati`, headers: as('bob') });
    await st('sold'); // followers still see it, marked sold
    const sold = json(await app.inject({ method: 'GET', url: '/api/me/oglasi/pracenje', headers: as('bob') })).items[0];
    expect(sold).toMatchObject({ status: 'sold' });
    await st('active');
    await query("UPDATE listings SET expires_at = now() - interval '1 day' WHERE id = $1", [adId]);
    expect(json(await app.inject({ method: 'GET', url: '/api/oglasi', headers: as('bob') })).items).toHaveLength(0);
    expect(await expireListings()).toBe(1);
    expect((await one('SELECT status FROM listings WHERE id = $1', [adId]))!.status).toBe('expired');
    expect((await app.inject({ method: 'POST', url: `/api/oglasi/${adId}/obnovi`, headers: as('alice') })).statusCode).toBe(200);
    expect(json(await app.inject({ method: 'GET', url: '/api/oglasi', headers: as('bob') })).items).toHaveLength(1);
  });

  it('reminds 7, 3 and 1 day before the end, keeps expired ads 30 days, then deletes them with a mail', async () => {
    const { sendExpiryReminders, purgeExpiredListings } = await import('../src/listings/service.js');
    const outbox: Sent[] = [];
    const send = async (m: Sent) => void outbox.push(m);
    const img2 = json(await upload('alice', await png(400, 300))).id;
    const mk = await app.inject({ method: 'POST', url: '/api/oglasi', headers: as('alice'), payload: ad([img2], { title: 'LEGO 10328 Buket ruža' }) });
    expect(mk.statusCode).toBe(200);
    const id = json(mk).id;
    await app.inject({ method: 'POST', url: `/api/oglasi/${id}/poruke`, headers: as('bob'), payload: { text: 'Da li je još tu?' } });
    const stage = async () => (await one<{ notified_stage: number }>('SELECT notified_stage FROM listings WHERE id = $1', [id]))!.notified_stage;
    const left = (interval: string) => query(`UPDATE listings SET expires_at = now() + interval '${interval}' WHERE id = $1`, [id]);

    expect(await sendExpiryReminders(send)).toBe(0); // 30 days left: nothing to say
    await left('6 days');
    expect(await sendExpiryReminders(send)).toBe(1);
    expect(await sendExpiryReminders(send)).toBe(0); // one mail per stage
    expect(outbox[0].subject).toContain('ističe za 7 dana');
    await left('2 days');
    expect(await sendExpiryReminders(send)).toBe(1);
    expect(outbox[1].subject).toContain('za 3 dana');
    await left('10 hours');
    expect(await sendExpiryReminders(send)).toBe(1);
    expect(outbox[2].subject).toContain('ističe sutra');
    expect(await stage()).toBe(3);

    // extending the ad starts the reminders over
    expect((await app.inject({ method: 'POST', url: `/api/oglasi/${id}/obnovi`, headers: as('alice') })).statusCode).toBe(200);
    expect(await stage()).toBe(0);
    expect((await one<{ n: number }>("SELECT count(*)::int AS n FROM listings WHERE id = $1 AND expires_at > now() + interval '29 days'", [id]))!.n).toBe(1);

    // a failed e-mail is tried again on the next run
    await left('5 days');
    expect(await sendExpiryReminders(async () => { throw new Error('smtp'); })).toBe(0);
    expect(await stage()).toBe(0);
    expect(await sendExpiryReminders(send)).toBe(1);

    // it runs out: the owner still sees it (expired) for 30 days and can bring it back
    await left('-1 hour');
    expect(await expireListings()).toBe(1);
    const mine = json(await app.inject({ method: 'GET', url: '/api/me/oglasi', headers: as('alice') })).items.find((x: { id: string }) => x.id === id);
    expect(mine).toMatchObject({ status: 'expired' });
    expect(mine.delete_at).toBeTruthy();
    expect(mine.notified_stage).toBeUndefined();
    outbox.length = 0;
    expect(await purgeExpiredListings(send)).toBe(0); // not yet
    await query("UPDATE listings SET expired_at = now() - interval '29 days' WHERE id = $1", [id]);
    expect(await purgeExpiredListings(send)).toBe(0);

    // reactivated in time: the clock is cleared
    expect((await app.inject({ method: 'POST', url: `/api/oglasi/${id}/obnovi`, headers: as('alice') })).statusCode).toBe(200);
    expect((await one<{ expired_at: string | null }>('SELECT expired_at FROM listings WHERE id = $1', [id]))!.expired_at).toBeNull();

    // untouched for 30 days: deleted with its pictures, the owner is told, the conversation stays
    await left('-1 hour');
    await expireListings();
    await query("UPDATE listings SET expired_at = now() - interval '31 days' WHERE id = $1", [id]);
    const file = (await one<{ file: string }>('SELECT file FROM listing_images WHERE id = $1', [img2]))!.file;
    expect(await purgeExpiredListings(send)).toBe(1);
    expect(await one('SELECT 1 FROM listings WHERE id = $1', [id])).toBeNull();
    expect(existsSync(path.join(config.LISTINGS_DIR, file))).toBe(false);
    expect(outbox).toHaveLength(1);
    expect(outbox[0].subject).toContain('je obrisan');
    expect(await one('SELECT 1 FROM conversations WHERE listing_id IS NULL AND listing_title = $1', ['LEGO 10328 Buket ruža'])).toBeTruthy();
  });

  it('makes public ads findable: head, sitemap, and noindex for the private pages', async () => {
    const { pageMeta } = await import('../src/seo/pages.js');
    const before = config.PUBLIC_MODE;
    config.PUBLIC_MODE = true;
    try {
      const m = await pageMeta(`/oglasi/${adId}`, new URLSearchParams());
      expect(m.status).toBe(200);
      expect(m.robots).toBeUndefined();
      expect(m.title).toContain('Millennium Falcon');
      expect(m.image?.url).toMatch(/^\/media\/oglasi\//);
      expect((await pageMeta('/oglasi', new URLSearchParams())).robots).toBeUndefined();
      for (const p of ['/poruke', '/poruke/5', '/moji-oglasi', '/oglasi/novi', `/oglasi/${adId}/izmeni`]) {
        expect((await pageMeta(p, new URLSearchParams())).robots).toBe('noindex, follow');
      }
      const map = await app.inject({ method: 'GET', url: '/sitemap-oglasi.xml' });
      expect(map.statusCode).toBe(200);
      expect(map.body).toContain(`/oglasi/${adId}<`);
      expect((await app.inject({ method: 'GET', url: '/sitemap.xml' })).body).toContain('sitemap-oglasi.xml');

      // a paused ad stays out of the index
      await query("UPDATE listings SET status = 'paused' WHERE id = $1", [adId]);
      expect((await pageMeta(`/oglasi/${adId}`, new URLSearchParams())).robots).toBe('noindex, follow');
      expect((await app.inject({ method: 'GET', url: '/sitemap-oglasi.xml' })).body).not.toContain(`/oglasi/${adId}<`);
      await query("UPDATE listings SET status = 'active' WHERE id = $1", [adId]);

      // off or admins-only: nothing is indexed
      config.LISTINGS_MODE = 'admins';
      expect((await pageMeta(`/oglasi/${adId}`, new URLSearchParams())).robots).toBe('noindex, nofollow');
      expect((await app.inject({ method: 'GET', url: '/sitemap-oglasi.xml' })).statusCode).toBe(404);
    } finally {
      config.LISTINGS_MODE = 'on';
      config.PUBLIC_MODE = before;
    }
  });

  it('deleting an ad removes its pictures; deleting the account removes the rest', async () => {
    const file = (await one<{ file: string }>('SELECT file FROM listing_images WHERE id = $1', [imgId]))!.file;
    expect(existsSync(path.join(config.LISTINGS_DIR, file))).toBe(true);
    expect((await app.inject({ method: 'DELETE', url: `/api/oglasi/${adId}`, headers: as('bob') })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/api/oglasi/${adId}`, headers: as('alice') })).statusCode).toBe(200);
    expect(existsSync(path.join(config.LISTINGS_DIR, file))).toBe(false);
    // the messages stay, the conversation just loses its link to the ad
    expect(await one('SELECT id FROM conversations WHERE listing_id IS NULL AND listing_title IS NOT NULL')).toBeTruthy();
    const kept = json(await app.inject({ method: 'GET', url: '/api/poruke', headers: as('bob') })).items.find((x: { listing_title: string }) => x.listing_title.startsWith('LEGO 75192 Millennium Falcon'));
    expect(kept).toMatchObject({ listing_status: 'deleted' });

    const img = json(await upload('alice', await png(300, 300))).id;
    const f2 = (await one<{ file: string }>('SELECT file FROM listing_images WHERE id = $1', [img]))!.file;
    const del = await app.inject({ method: 'DELETE', url: '/api/me', headers: as('alice'), payload: { password: 'tajna-lozinka' } });
    expect(del.statusCode).toBe(200);
    expect(existsSync(path.join(config.LISTINGS_DIR, f2))).toBe(false);
  });
});

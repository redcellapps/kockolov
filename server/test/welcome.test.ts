import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from '../src/config.js';
import { migrate, query } from '../src/db.js';
import { renderWelcomeMail, sendWelcomeMails } from '../src/mail/welcome.js';

const url = process.env.TEST_DATABASE_URL;
const dbAvailable = Boolean(url);

describe.skipIf(!dbAvailable)('welcome e-mail', () => {
  const pool = new pg.Pool({ connectionString: url });
  const sent: { to: string; subject: string; text: string }[] = [];
  const send = async (m: { to: string; subject: string; html: string; text: string }) => {
    sent.push(m);
  };
  const add = (email: string, acceptedMinutesAgo: number | null, extra = '') =>
    query(
      `INSERT INTO users (email, name, role, password_hash, accepted_at, self_signup${extra ? ', ' + extra.split('=')[0] : ''})
       VALUES ($1, $2, 'user', 'x', ${acceptedMinutesAgo === null ? 'NULL' : `now() - make_interval(mins => ${acceptedMinutesAgo})`}, true${extra ? ', ' + extra.split('=')[1] : ''})`,
      [email, email.split('@')[0]],
    );

  beforeAll(async () => {
    config.DATABASE_URL = url!;
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migrate(() => {});
  });
  afterAll(() => pool.end());

  it('is sent once, only after 10 minutes, and only to confirmed accounts', async () => {
    await add('stara@example.com', 600, "welcome_sent_at=now()"); // already welcomed
    await add('nova@example.com', 11);
    await add('tek@example.com', 3); // confirmed 3 minutes ago, too early
    await add('nepotvrdjena@example.com', null);
    expect(await sendWelcomeMails(send)).toBe(1);
    expect(sent.map((m) => m.to)).toEqual(['nova@example.com']);
    expect(sent[0].subject).toBe('Dobrodošlica na Kockolovu');
    expect(sent[0].text).toContain('Ćao nova,');
    expect(await sendWelcomeMails(send)).toBe(0); // never twice
    await query("UPDATE users SET accepted_at = now() - interval '12 minutes' WHERE email = 'tek@example.com'");
    expect(await sendWelcomeMails(send)).toBe(1);
    expect(sent.map((m) => m.to)).toEqual(['nova@example.com', 'tek@example.com']);
  });

  it('retries a failed send, a few times at most', async () => {
    await add('pada@example.com', 20);
    const fail = async () => {
      throw new Error('SMTP');
    };
    for (let i = 0; i < 5; i++) await sendWelcomeMails(fail);
    const u = (await query("SELECT welcome_tries, welcome_sent_at FROM users WHERE email = 'pada@example.com'"))[0];
    expect(u.welcome_tries).toBe(3);
    expect(u.welcome_sent_at).toBeNull();
    expect(await sendWelcomeMails(send)).toBe(0); // gave up
  });

  it('mentions ads only once they are open to everyone', () => {
    config.LISTINGS_MODE = 'off';
    expect(renderWelcomeMail({ name: '' }).text).not.toContain('oglas');
    config.LISTINGS_MODE = 'on';
    expect(renderWelcomeMail({ name: 'Mika' }).text).toContain('/blog/kako-da-postavis-oglas-za-lego-set');
  });
});

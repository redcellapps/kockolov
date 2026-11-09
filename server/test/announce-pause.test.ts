import pg from 'pg';
import { describe, expect, it, vi } from 'vitest';

const mailer = vi.hoisted(() => ({ script: [] as (Error | null)[], sent: [] as string[] }));
vi.mock('../src/mail/mailer.js', () => ({
  mailConfigured: () => true,
  accountFrom: () => 'Kockolov <nalog@example.com>',
  sendMail: async () => {},
  // each call takes the next scripted outcome: an Error to throw, or null to succeed
  sendAccountMail: async (m: { to: string }) => {
    const next = mailer.script.shift();
    if (next) throw next;
    mailer.sent.push(m.to);
  },
}));

const dbAvailable = await (async () => {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 1500 });
  try {
    await c.connect();
    await c.end();
    return true;
  } catch {
    return false;
  }
})();

describe('which mail errors are temporary', async () => {
  const { isTemporaryMailError } = await import('../src/mail/announce.js');
  it('treats the hourly limit, login and connection problems as temporary, unknown recipients as final', () => {
    const limit = 'Can\'t send mail - all recipients were rejected: 550-Email account is sending too much emails [limitlog]:\n550 deny / email / nalog@kockolov.rs / 120.6 / 1h';
    expect(isTemporaryMailError(new Error(limit))).toBe(true);
    expect(isTemporaryMailError(new Error('Invalid login: 535 Incorrect authentication data'))).toBe(true);
    expect(isTemporaryMailError(new Error('connect ECONNREFUSED 159.69.146.251:587'))).toBe(true);
    expect(isTemporaryMailError(Object.assign(new Error('x'), { responseCode: 451 }))).toBe(true);
    expect(isTemporaryMailError(Object.assign(new Error('x'), { code: 'ETIMEDOUT' }))).toBe(true);
    expect(isTemporaryMailError(new Error('550 5.1.1 <a@b.c>: Recipient address rejected: User unknown'))).toBe(false);
    expect(isTemporaryMailError(Object.assign(new Error('x'), { responseCode: 553 }))).toBe(false);
  });
});

describe.skipIf(!dbAvailable)('news e-mail: the mail server pushes back', async () => {
  const { config } = await import('../src/config.js');
  const { migrate, query, one } = await import('../src/db.js');
  const { createAnnouncement, hourlyWaitMs, listAnnouncements, retryAnnouncement } = await import('../src/mail/announce.js');
  await migrate();

  const draft = { subject: 'Probna vest', body: 'Test.' };
  const makeUsers = async (n: number) => {
    await query("DELETE FROM users WHERE email LIKE 'pauza-%@example.com'");
    for (let i = 1; i <= n; i++) {
      await query(
        "INSERT INTO users (email, name, role, password_hash, accepted_at, news_enabled) VALUES ($1, 'P', 'user', 'x', now(), true)",
        [`pauza-${i}@example.com`],
      );
    }
  };
  const setup = async (n: number) => {
    await query('DELETE FROM announcement_deliveries');
    await query('DELETE FROM announcements');
    await query("UPDATE users SET news_enabled = false WHERE email NOT LIKE 'pauza-%@example.com'");
    await makeUsers(n);
    mailer.script.length = 0;
    mailer.sent.length = 0;
    Object.assign(config, { ANNOUNCE_DELAY_MS: 0, ANNOUNCE_PER_HOUR: 0, ANNOUNCE_PAUSE_MS: 5, ANNOUNCE_MAX_PAUSES: 3 });
  };
  const admin = async () => (await one<{ id: number }>("INSERT INTO users (email, name, role, password_hash, accepted_at, news_enabled) VALUES ('pauza-admin@example.com', 'A', 'admin', 'x', now(), false) ON CONFLICT (email) DO UPDATE SET name = 'A' RETURNING id"))!.id;

  it('pauses on the hourly limit and then sends the same people, nobody is marked failed', async () => {
    await setup(4);
    const limit = new Error('Can\'t send mail - all recipients were rejected: 550-Email account is sending too much emails [limitlog]');
    mailer.script.push(null, limit, limit); // first goes out, then two refusals
    await createAnnouncement(draft, await admin(), () => {});
    await vi.waitFor(async () => expect((await listAnnouncements())[0].status).toBe('sent'));
    expect((await listAnnouncements())[0]).toMatchObject({ total: 4, sent: 4, failed: 0 });
    expect(mailer.sent.sort()).toEqual(['pauza-1@example.com', 'pauza-2@example.com', 'pauza-3@example.com', 'pauza-4@example.com']);
  });

  it('still marks a final rejection as failed and goes on with the others', async () => {
    await setup(3);
    mailer.script.push(new Error('550 5.1.1 Recipient address rejected: User unknown'));
    await createAnnouncement(draft, await admin(), () => {});
    await vi.waitFor(async () => expect((await listAnnouncements())[0].status).toBe('sent'));
    expect((await listAnnouncements())[0]).toMatchObject({ total: 3, sent: 2, failed: 1 });
  });

  it('gives up after too many pauses in a row, keeps everyone waiting, and "retry" picks it up again', async () => {
    await setup(3);
    const down = new Error('connect ECONNREFUSED 159.69.146.251:587');
    mailer.script.push(down, down, down, down); // MAX_PAUSES = 3 → the 4th refusal ends the run
    const { id } = await createAnnouncement(draft, await admin(), () => {});
    await vi.waitFor(async () => expect(mailer.script).toHaveLength(0));
    await vi.waitFor(async () => {
      const { isSending } = await import('../src/mail/announce.js');
      expect(isSending(id)).toBe(false);
    });
    expect((await listAnnouncements())[0]).toMatchObject({ status: 'sending', sent: 0, failed: 0, total: 3 });

    expect(await retryAnnouncement(id, () => {})).toBe(3);
    await vi.waitFor(async () => expect((await listAnnouncements())[0]).toMatchObject({ status: 'sent', sent: 3, failed: 0 }));
  });

  it('stays under the hourly budget by waiting for the oldest e-mail of the hour to age out', async () => {
    await setup(3);
    config.ANNOUNCE_PER_HOUR = 2;
    expect(await hourlyWaitMs()).toBe(0);
    const a = await one<{ id: number }>("INSERT INTO announcements (subject, body) VALUES ('x', 'y') RETURNING id");
    const ids = await query<{ id: number }>("SELECT id FROM users WHERE email IN ('pauza-1@example.com', 'pauza-2@example.com') ORDER BY email");
    await query(
      "INSERT INTO announcement_deliveries (announcement_id, user_id, sent_at) VALUES ($1, $2, now() - interval '59 minutes'), ($1, $3, now() - interval '10 minutes')",
      [a!.id, ids[0].id, ids[1].id],
    );
    const wait = await hourlyWaitMs();
    expect(wait).toBeGreaterThan(55_000); // ~1 min until the 59-minute-old one leaves the window, plus a margin
    expect(wait).toBeLessThan(70_000);
    config.ANNOUNCE_PER_HOUR = 3;
    expect(await hourlyWaitMs()).toBe(0);
  });
});

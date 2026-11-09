import { config } from '../config.js';
import { one, query } from '../db.js';
import { escapeHtml } from './format.js';
import { sendAccountMail } from './mailer.js';

// News e-mails from the admin page ("what's new on Kockolov") to every confirmed user who
// hasn't turned news off. They go out from the account address, one by one with a short
// pause, and each delivery is recorded, so sending can resume after a restart.

const site = () => config.APP_URL.replace(/\/$/, '');

/** Who gets news: confirmed accounts that haven't turned news off */
export const RECIPIENTS_SQL = 'SELECT id FROM users WHERE accepted_at IS NOT NULL AND news_enabled';

export async function countRecipients(): Promise<number> {
  return (await one<{ n: number }>(`SELECT count(*)::int AS n FROM (${RECIPIENTS_SQL}) r`))?.n ?? 0;
}

export function newsUnsubscribeUrl(token: string): string {
  return `${site()}/odjava/${token}?lista=novosti`;
}

const LINK = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]+[^\s<.,;:!?)"'])/g;

/** **bold**, [text](https://…) and bare https:// links, on already escaped text */
function inline(raw: string): string {
  let out = '';
  let last = 0;
  for (const m of raw.matchAll(LINK)) {
    out += bold(escapeHtml(raw.slice(last, m.index)));
    const href = m[2] ?? m[3];
    const label = m[1] ?? m[3];
    out += `<a href="${escapeHtml(href)}" style="color:#1d5fd1">${bold(escapeHtml(label))}</a>`;
    last = (m.index ?? 0) + m[0].length;
  }
  return out + bold(escapeHtml(raw.slice(last)));
}
const bold = (html: string) => html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');

const BULLET = /^[ \t]*[-*•][ \t]+/;
const HEADING = /^#{1,3}[ \t]+/;

/**
 * The admin writes plain text: an empty line starts a new paragraph, lines starting with "- "
 * make a list, "# " a heading, **bold**, [text](https://…) links. A heading and a list may follow
 * each other without an empty line in between.
 */
export function bodyToHtml(body: string): string {
  const out: string[] = [];
  let para: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (para.length) out.push(`<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#333">${para.map(inline).join('<br>')}</p>`);
    if (list.length) {
      const items = list.map((l) => `<li style="margin:0 0 6px">${inline(l)}</li>`).join('');
      out.push(`<ul style="margin:0 0 14px;padding-left:22px;font-size:15px;line-height:1.5;color:#333">${items}</ul>`);
    }
    para = [];
    list = [];
  };
  for (const line of body.replace(/\r\n?/g, '\n').trim().split('\n')) {
    if (!line.trim()) {
      flush();
    } else if (HEADING.test(line)) {
      flush();
      out.push(`<div style="margin:18px 0 8px;font-size:17px;font-weight:800;color:#1a1a1a">${inline(line.replace(HEADING, ''))}</div>`);
    } else if (BULLET.test(line)) {
      if (para.length) flush();
      list.push(line.replace(BULLET, ''));
    } else {
      if (list.length) flush();
      para.push(line);
    }
  }
  flush();
  return out.join('\n');
}

/** Plain-text part: links written out, no markup */
export function bodyToText(body: string): string {
  return body
    .replace(/\r\n?/g, '\n')
    .trim()
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1 ($2)')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/^#{1,3}[ \t]+/gm, '')
    .replace(/^[ \t]*[*•][ \t]+/gm, '- ');
}

export function renderAnnouncement(opts: { subject: string; body: string; name: string; unsubscribe: string }) {
  const url = site();
  const hello = opts.name ? `Ćao ${escapeHtml(opts.name)},` : 'Ćao,';
  const html = `<!doctype html><html lang="sr"><body style="margin:0;background:#f6f4ee;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f4ee"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden">
    <tr><td style="background:#ffcf00;padding:20px 24px">
      <div style="font-size:22px;font-weight:800;color:#1a1a1a">Kockolov</div>
      <div style="font-size:13px;color:#3a3a3a">Novosti na sajtu</div>
    </td></tr>
    <tr><td style="padding:24px 24px 4px">
      <div style="font-size:20px;font-weight:800;line-height:1.3">${escapeHtml(opts.subject)}</div>
      <p style="margin:14px 0 14px;font-size:15px;line-height:1.55;color:#333">${hello}</p>
      ${bodyToHtml(opts.body)}
    </td></tr>
    <tr><td style="padding:8px 24px 24px"><a href="${url}" style="display:inline-block;background:#1a1a1a;color:#ffcf00;text-decoration:none;font-weight:800;font-size:15px;padding:13px 20px;border-radius:12px">Otvori Kockolov</a></td></tr>
    <tr><td style="padding:0 24px 24px;font-size:12px;line-height:1.5;color:#8a8a8a">Ovo je povremeno obaveštenje o novostima na Kockolovu. Ne želiš ih više? <a href="${escapeHtml(opts.unsubscribe)}" style="color:#6b6b6b">Odjavi se od novosti</a>; jutarnji pregled ponuda ostaje kakav jeste.<br>LEGO® je zaštićeni znak LEGO grupe; Kockolov nije povezan sa LEGO grupom.</td></tr>
  </table></td></tr></table></body></html>`;
  const text = [
    opts.subject,
    '',
    opts.name ? `Ćao ${opts.name},` : 'Ćao,',
    '',
    bodyToText(opts.body),
    '',
    `Kockolov: ${url}`,
    '',
    `Odjava od novosti: ${opts.unsubscribe}`,
  ].join('\n');
  return { subject: opts.subject, html, text };
}

/** The e-mail as one user gets it, with their one-click unsubscribe */
function mailFor(a: { subject: string; body: string }, u: { email: string; name: string; unsubscribe_token: string }) {
  const oneClick = `${site()}/api/unsubscribe/${u.unsubscribe_token}?list=news`;
  return {
    to: u.email,
    ...renderAnnouncement({ ...a, name: u.name, unsubscribe: newsUnsubscribeUrl(u.unsubscribe_token) }),
    replyTo: config.CONTACT_EMAIL,
    headers: { 'List-Unsubscribe': `<${oneClick}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  };
}

/** A test copy for the admin before sending to everyone */
export async function sendTestAnnouncement(a: { subject: string; body: string }, adminId: number): Promise<string> {
  const u = await one<{ email: string; name: string; unsubscribe_token: string }>(
    'SELECT email, name, unsubscribe_token FROM users WHERE id = $1',
    [adminId],
  );
  if (!u) throw new Error('Nalog nije pronađen');
  const m = mailFor(a, u);
  await sendAccountMail({ ...m, subject: `[proba] ${m.subject}` });
  return u.email;
}

/** Records the announcement with its recipients and starts sending in the background. */
export async function createAnnouncement(a: { subject: string; body: string }, adminId: number, log = console.log) {
  const row = await one<{ id: number }>('INSERT INTO announcements (subject, body, created_by) VALUES ($1, $2, $3) RETURNING id', [
    a.subject,
    a.body,
    adminId,
  ]);
  const id = row!.id;
  const rec = await query(
    `INSERT INTO announcement_deliveries (announcement_id, user_id) SELECT $1, id FROM (${RECIPIENTS_SQL}) r RETURNING user_id`,
    [id],
  );
  void deliverAnnouncement(id, log);
  return { id, recipients: rec.length };
}

const running = new Set<number>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const TEMPORARY_CODES = new Set(['ECONNECTION', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ESOCKET', 'EDNS', 'EAI_AGAIN', 'EAUTH']);
const TEMPORARY_TEXT = /sending too much|too many|rate.?limit|limitlog|quota|try again|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|\b535\b/i;

/**
 * Problems on the sending side that say nothing about the recipient: the mailbox' hourly limit,
 * a refused login, an unreachable mail server, any 4xx. Those must not turn into a failed delivery;
 * the run pauses and tries the same person again later.
 */
export function isTemporaryMailError(err: unknown): boolean {
  const e = err as { code?: string; responseCode?: number; message?: string };
  const rc = e.responseCode ?? 0;
  if ((rc >= 400 && rc < 500) || rc === 535) return true;
  if (e.code && TEMPORARY_CODES.has(e.code)) return true;
  return TEMPORARY_TEXT.test(e.message ?? '');
}

/**
 * How long to wait before the next e-mail so that no more than ANNOUNCE_PER_HOUR news e-mails
 * leave in any hour (the mail server cuts a mailbox off at about 120 an hour). 0 = go on.
 */
export async function hourlyWaitMs(): Promise<number> {
  const limit = config.ANNOUNCE_PER_HOUR;
  if (limit <= 0) return 0;
  const r = await one<{ n: number; wait_ms: number | null }>(
    `SELECT count(*)::int AS n,
            (extract(epoch FROM (min(sent_at) + interval '1 hour' - now())) * 1000)::float8 AS wait_ms
       FROM announcement_deliveries WHERE sent_at > now() - interval '1 hour'`,
  );
  if (!r || r.n < limit) return 0;
  return Math.max(1000, Math.ceil(r.wait_ms ?? 0) + 2000);
}

export function isSending(id: number): boolean {
  return running.has(id);
}

/** Works through the deliveries not yet sent. Safe to call again; one run per announcement at a time. */
export async function deliverAnnouncement(id: number, log = console.log): Promise<void> {
  if (running.has(id)) return;
  running.add(id);
  try {
    const a = await one<{ subject: string; body: string }>('SELECT subject, body FROM announcements WHERE id = $1', [id]);
    if (!a) return;
    let sent = 0;
    let failed = 0;
    let pauses = 0;
    run: for (;;) {
      // someone who turned news off after the admin pressed send is skipped
      await query(
        `DELETE FROM announcement_deliveries d USING users u
          WHERE d.user_id = u.id AND d.announcement_id = $1 AND d.sent_at IS NULL AND d.error IS NULL AND NOT u.news_enabled`,
        [id],
      );
      const batch = await query<{ user_id: number; email: string; name: string; unsubscribe_token: string }>(
        `SELECT d.user_id, u.email, u.name, u.unsubscribe_token
           FROM announcement_deliveries d JOIN users u ON u.id = d.user_id
          WHERE d.announcement_id = $1 AND d.sent_at IS NULL AND d.error IS NULL
          ORDER BY d.user_id LIMIT 25`,
        [id],
      );
      if (!batch.length) break;
      for (const u of batch) {
        const wait = await hourlyWaitMs();
        if (wait > 0) {
          log(`novosti #${id}: sat je pun (${config.ANNOUNCE_PER_HOUR} mejlova), čekam ${Math.round(wait / 1000)} s`);
          await sleep(wait);
        }
        try {
          await sendAccountMail(mailFor(a, u));
          await query('UPDATE announcement_deliveries SET sent_at = now() WHERE announcement_id = $1 AND user_id = $2', [id, u.user_id]);
          sent++;
          pauses = 0;
        } catch (err) {
          const msg = (err as Error).message;
          if (isTemporaryMailError(err)) {
            // not this person's fault: leave them waiting, pause, and go on from the same place
            if (++pauses > config.ANNOUNCE_MAX_PAUSES) {
              log(`novosti #${id}: mejl server i dalje ne prima (${msg}); odustajem, ostalo čeka. Nastavlja se klikom na „Pokušaj ponovo“ ili posle restarta.`);
              return;
            }
            log(`novosti #${id}: privremena greška (${msg}); pauza ${Math.round(config.ANNOUNCE_PAUSE_MS / 1000)} s, pokušaj ${pauses}/${config.ANNOUNCE_MAX_PAUSES}`);
            await sleep(config.ANNOUNCE_PAUSE_MS);
            continue run;
          }
          failed++;
          await query('UPDATE announcement_deliveries SET error = $3 WHERE announcement_id = $1 AND user_id = $2', [
            id,
            u.user_id,
            msg.slice(0, 500),
          ]);
          log(`novosti #${id}: greška za ${u.email}: ${msg}`);
        }
        if (config.ANNOUNCE_DELAY_MS > 0) await sleep(config.ANNOUNCE_DELAY_MS);
      }
    }
    await query("UPDATE announcements SET status = 'sent', finished_at = now() WHERE id = $1", [id]);
    log(`novosti #${id}: poslato ${sent}, neuspešno ${failed}`);
  } catch (err) {
    log(`novosti #${id}: slanje prekinuto: ${(err as Error).message}`);
  } finally {
    running.delete(id);
  }
}

/** Failed deliveries get another try, and a run that gave up waiting for the mail server is picked up again */
export async function retryAnnouncement(id: number, log = console.log): Promise<number> {
  await query(
    `UPDATE announcement_deliveries SET error = NULL WHERE announcement_id = $1 AND sent_at IS NULL AND error IS NOT NULL`,
    [id],
  );
  const waiting = (
    await one<{ n: number }>(
      'SELECT count(*)::int AS n FROM announcement_deliveries WHERE announcement_id = $1 AND sent_at IS NULL AND error IS NULL',
      [id],
    )
  )?.n ?? 0;
  if (waiting) {
    await query("UPDATE announcements SET status = 'sending', finished_at = NULL WHERE id = $1", [id]);
    void deliverAnnouncement(id, log);
  }
  return waiting;
}

/** After a restart: finish whatever was being sent */
export async function resumeAnnouncements(log = console.log): Promise<void> {
  const open = await query<{ id: number }>("SELECT id FROM announcements WHERE status = 'sending' ORDER BY id");
  for (const a of open) {
    log(`novosti #${a.id}: nastavljam slanje`);
    void deliverAnnouncement(a.id, log);
  }
}

export async function listAnnouncements() {
  return query<{
    id: number;
    subject: string;
    created_at: string;
    finished_at: string | null;
    status: 'sending' | 'sent';
    author: string | null;
    total: number;
    sent: number;
    failed: number;
  }>(
    `SELECT a.id, a.subject, a.created_at, a.finished_at, a.status, coalesce(nullif(u.name, ''), u.email) AS author,
            count(d.user_id)::int AS total,
            count(d.sent_at)::int AS sent,
            count(d.error)::int AS failed
       FROM announcements a
       LEFT JOIN users u ON u.id = a.created_by
       LEFT JOIN announcement_deliveries d ON d.announcement_id = a.id
      GROUP BY a.id, u.name, u.email
      ORDER BY a.created_at DESC LIMIT 20`,
  );
}

import { config } from '../config.js';
import { one, query } from '../db.js';
import { escapeHtml } from './format.js';

const MAX_TRIES = 3;
const BATCH = 20;

/** The welcome e-mail: what to do first. Ads are only mentioned once they are open to everyone. */
export function renderWelcomeMail(o: { name: string }) {
  const site = config.APP_URL.replace(/\/$/, '');
  const hello = o.name ? `Ćao ${o.name},` : 'Ćao,';
  const lines = [
    'Hvala što si napravio nalog na Kockolovu. Evo od čega možeš da počneš:',
    '• Prati setove koje želiš (srce na stranici seta): cene proveravamo svako jutro i javljamo ti kad pojeftine.',
    '• Pogledaj ponude dana: najbolje cene LEGO® setova u srpskim prodavnicama.',
    ...(config.LISTINGS_MODE === 'on' ? ['• Imaš set da prodaš? Postavi oglas za par minuta, korak po korak: ' + `${site}/blog/kako-da-postavis-oglas-za-lego-set`] : []),
    `Ako nešto ne radi kako treba ili imaš predlog, piši na ${config.CONTACT_EMAIL}.`,
  ];
  const subject = 'Dobrodošlica na Kockolovu';
  const button = 'Pogledaj ponude dana';
  const target = `${site}/ponude`;
  const html = `<!doctype html><html lang="sr"><body style="margin:0;background:#f6f4ee;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f4ee"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden">
    <tr><td style="background:#ffcf00;padding:20px 24px"><div style="font-size:22px;font-weight:800">Kockolov</div><div style="font-size:13px;color:#3a3a3a">Dobrodošlica</div></td></tr>
    <tr><td style="padding:24px 24px 8px">
      <div style="font-size:18px;font-weight:700">${escapeHtml(hello)}</div>
      ${lines.map((l) => `<p style="font-size:15px;line-height:1.5;color:#333;margin:10px 0 0">${escapeHtml(l)}</p>`).join('\n      ')}
    </td></tr>
    <tr><td style="padding:16px 24px 8px"><a href="${escapeHtml(target)}" style="display:inline-block;background:#1a1a1a;color:#ffcf00;text-decoration:none;font-weight:800;font-size:16px;padding:14px 22px;border-radius:12px">${button}</a></td></tr>
    <tr><td style="padding:12px 24px 24px;font-size:12px;line-height:1.5;color:#8a8a8a">Ovo je jednokratna poruka dobrodošlice. Pitanja: ${escapeHtml(config.CONTACT_EMAIL)}</td></tr>
  </table></td></tr></table></body></html>`;
  const text = [hello, '', ...lines.flatMap((l) => [l, '']), `${button}: ${target}`].join('\n');
  return { subject, html, text };
}

type Send = (m: { to: string; subject: string; html: string; text: string }) => Promise<void>;

/**
 * Welcome e-mail for accounts confirmed at least WELCOME_DELAY_MINUTES ago, once each. The user is claimed
 * first, so two workers can't both send; a failed send puts them back (up to MAX_TRIES attempts).
 */
export async function sendWelcomeMails(send: Send, log: (m: string) => void = () => {}): Promise<number> {
  const due = await query<{ id: number; email: string; name: string }>(
    `SELECT id, email, name FROM users
      WHERE welcome_sent_at IS NULL AND welcome_tries < $2 AND accepted_at IS NOT NULL AND suspended_at IS NULL
        AND accepted_at <= now() - make_interval(mins => $1) AND accepted_at > now() - interval '3 days'
      ORDER BY accepted_at LIMIT ${BATCH}`,
    [config.WELCOME_DELAY_MINUTES, MAX_TRIES],
  );
  let sent = 0;
  for (const u of due) {
    const claimed = await one<{ id: number }>('UPDATE users SET welcome_sent_at = now() WHERE id = $1 AND welcome_sent_at IS NULL RETURNING id', [u.id]);
    if (!claimed) continue;
    try {
      await send({ to: u.email, ...renderWelcomeMail({ name: u.name }) });
      sent++;
    } catch (e) {
      await one('UPDATE users SET welcome_sent_at = NULL, welcome_tries = welcome_tries + 1 WHERE id = $1 RETURNING id', [u.id]);
      log(`dobrodošlica korisniku ${u.id} nije poslata: ${(e as Error).message}`);
    }
  }
  return sent;
}

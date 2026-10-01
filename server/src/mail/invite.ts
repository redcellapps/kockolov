import { config } from '../config.js';
import { escapeHtml } from './format.js';

export type LinkKind = 'invite' | 'reset';

/** E-mail with a link to set a password: an invitation for a new account, or a new password for an existing one. */
export function renderInvite(opts: { kind: LinkKind; name: string; url: string; inviter?: string | null; days: number }) {
  const site = config.APP_URL.replace(/\/$/, '');
  const hello = opts.name ? `Ćao ${escapeHtml(opts.name)},` : 'Ćao,';
  const invite = opts.kind === 'invite';
  const subject = invite ? 'Pozvan si na Kockolov' : 'Link za novu lozinku na Kockolovu';
  const who = opts.inviter ? escapeHtml(opts.inviter) : 'Administrator';
  const lead = invite
    ? `${who} te poziva na Kockolov, sajt koji svakog jutra upoređuje cene LEGO® setova u srpskim prodavnicama i izdvaja najbolje ponude.`
    : 'Za tvoj nalog na Kockolovu zatražen je link za novu lozinku.';
  const action = invite ? 'Postavi lozinku' : 'Postavi novu lozinku';
  const after = invite
    ? 'Kad postaviš lozinku, možeš da pratiš setove i dobijaš jutarnji pregled ponuda na ovaj e-mail.'
    : 'Stara lozinka važi dok ne postaviš novu.';
  const ignore = invite ? 'Ako ne očekuješ ovaj poziv, slobodno ignoriši ovaj e-mail.' : 'Ako nisi tražio novu lozinku, slobodno ignoriši ovaj e-mail.';

  const html = `<!doctype html><html lang="sr"><body style="margin:0;background:#f6f4ee;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f4ee"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden">
    <tr><td style="background:#ffcf00;padding:20px 24px">
      <div style="font-size:22px;font-weight:800;color:#1a1a1a">Kockolov</div>
      <div style="font-size:13px;color:#3a3a3a">Najbolje cene LEGO® setova u Srbiji</div>
    </td></tr>
    <tr><td style="padding:24px 24px 8px">
      <div style="font-size:18px;font-weight:700">${hello}</div>
      <p style="font-size:15px;line-height:1.5;color:#333;margin:10px 0 0">${lead}</p>
    </td></tr>
    <tr><td style="padding:16px 24px 8px">
      <a href="${escapeHtml(opts.url)}" style="display:inline-block;background:#1a1a1a;color:#ffcf00;text-decoration:none;font-weight:800;font-size:16px;padding:14px 22px;border-radius:12px">${action}</a>
    </td></tr>
    <tr><td style="padding:8px 24px 0;font-size:14px;line-height:1.5;color:#444">
      ${after}<br>Link važi ${opts.days} dana i može se iskoristiti jednom.
    </td></tr>
    <tr><td style="padding:16px 24px 0;font-size:12px;line-height:1.5;color:#6b6b6b">
      Ako dugme ne radi, otvori ovaj link:<br><a href="${escapeHtml(opts.url)}" style="color:#1d5fd1;word-break:break-all">${escapeHtml(opts.url)}</a>
    </td></tr>
    <tr><td style="padding:20px 24px 24px;font-size:12px;color:#8a8a8a">${ignore}<br>${escapeHtml(site)}</td></tr>
  </table></td></tr></table></body></html>`;

  const text = [
    opts.name ? `Ćao ${opts.name},` : 'Ćao,',
    '',
    lead.replace(/&amp;/g, '&'),
    '',
    `${action}: ${opts.url}`,
    `Link važi ${opts.days} dana i može se iskoristiti jednom.`,
    '',
    after,
    ignore,
  ].join('\n');

  return { subject, html, text };
}

import { config } from '../config.js';
import { escapeHtml } from './format.js';

export type LinkKind = 'invite' | 'reset' | 'verify';

/** "7 dana", "24 sata" */
export function validFor(days: number): string {
  return days === 1 ? '24 sata' : `${days} dana`;
}

const COPY: Record<LinkKind, { subject: string; action: string; after: string; ignore: string }> = {
  invite: {
    subject: 'Pozvan si na Kockolov',
    action: 'Postavi lozinku',
    after: 'Kad postaviš lozinku, možeš da pratiš setove i dobijaš jutarnji pregled ponuda na ovaj e-mail.',
    ignore: 'Ako ne očekuješ ovaj poziv, slobodno ignoriši ovaj e-mail.',
  },
  reset: {
    subject: 'Link za novu lozinku na Kockolovu',
    action: 'Postavi novu lozinku',
    after: 'Stara lozinka važi dok ne postaviš novu.',
    ignore: 'Ako nisi tražio novu lozinku, slobodno ignoriši ovaj e-mail.',
  },
  verify: {
    subject: 'Potvrdi e-mail adresu za Kockolov',
    action: 'Potvrdi e-mail adresu',
    after: 'Posle potvrde možeš da pratiš setove i dobijaš jutarnji pregled najboljih ponuda.',
    ignore: 'Ako nisi otvorio nalog na Kockolovu, slobodno ignoriši ovaj e-mail; bez potvrde nalog neće biti aktiviran.',
  },
};

/**
 * E-mail with a one-time link: an invitation to set a password, a new password for an existing
 * account, or the confirmation of a new sign-up.
 */
export function renderInvite(opts: { kind: LinkKind; name: string; url: string; inviter?: string | null; days: number }) {
  const site = config.APP_URL.replace(/\/$/, '');
  const hello = opts.name ? `Ćao ${escapeHtml(opts.name)},` : 'Ćao,';
  const { subject, action, after, ignore } = COPY[opts.kind];
  const who = opts.inviter ? escapeHtml(opts.inviter) : 'Administrator';
  const lead =
    opts.kind === 'invite'
      ? `${who} te poziva na Kockolov, sajt koji svakog jutra upoređuje cene LEGO® setova u srpskim prodavnicama i izdvaja najbolje ponude.`
      : opts.kind === 'reset'
        ? 'Za tvoj nalog na Kockolovu zatražen je link za novu lozinku.'
        : 'Hvala na registraciji na Kockolovu. Još samo jedan korak: potvrdi da je ovo tvoja e-mail adresa.';
  const valid = `Link važi ${validFor(opts.days)} i može se iskoristiti jednom.`;

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
      ${after}<br>${valid}
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
    valid,
    '',
    after,
    ignore,
  ].join('\n');

  return { subject, html, text };
}

import { config } from '../config.js';
import { escapeHtml } from './format.js';

type Opts =
  | { kind: 'expiring'; name: string; title: string; daysLeft: number; expiresAt: string }
  | { kind: 'deleted'; name: string; title: string };

const dayWord = (n: number) => (n === 1 ? 'dan' : 'dana');

/** E-mails about the life of an ad: it is about to run out (7, 3, 1 day before) and it was deleted after staying expired. */
export function renderListingMail(o: Opts) {
  const site = config.APP_URL.replace(/\/$/, '');
  const url = `${site}/moji-oglasi`;
  const hello = o.name ? `Ćao ${o.name},` : 'Ćao,';
  let subject: string;
  let lines: string[];
  let button: string | null;
  if (o.kind === 'expiring') {
    const when = o.daysLeft === 1 ? 'sutra' : `za ${o.daysLeft} ${dayWord(o.daysLeft)}`;
    subject = o.daysLeft === 1 ? `Tvoj oglas „${o.title}” ističe sutra` : `Tvoj oglas „${o.title}” ističe za ${o.daysLeft} ${dayWord(o.daysLeft)}`;
    lines = [
      `Tvoj oglas „${o.title}” ističe ${when}.`,
      'Ako je set još tu, produži oglas za još 30 dana jednim klikom u delu „Moji oglasi”. Ako ga ne produžiš, oglas se skida sa sajta, ali ostaje u tvom nalogu još 30 dana, pa ga možeš kasnije vratiti.',
    ];
    button = 'Produži oglas';
  } else {
    subject = `Tvoj oglas „${o.title}” je obrisan`;
    lines = [
      `Oglas „${o.title}” je istekao pre 30 dana i nije obnovljen, pa smo ga obrisali zajedno sa njegovim fotografijama.`,
      'Poruke koje si razmenio sa kupcima ostaju u tvom nalogu. Ako i dalje prodaješ set, možeš da postaviš novi oglas.',
    ];
    button = 'Postavi novi oglas';
  }
  const target = o.kind === 'expiring' ? url : `${site}/oglasi/novi`;
  const html = `<!doctype html><html lang="sr"><body style="margin:0;background:#f6f4ee;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f4ee"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden">
    <tr><td style="background:#ffcf00;padding:20px 24px"><div style="font-size:22px;font-weight:800">Kockolov</div><div style="font-size:13px;color:#3a3a3a">Oglasi</div></td></tr>
    <tr><td style="padding:24px 24px 8px">
      <div style="font-size:18px;font-weight:700">${escapeHtml(hello)}</div>
      ${lines.map((l) => `<p style="font-size:15px;line-height:1.5;color:#333;margin:10px 0 0">${escapeHtml(l)}</p>`).join('\n      ')}
    </td></tr>
    <tr><td style="padding:16px 24px 8px"><a href="${escapeHtml(target)}" style="display:inline-block;background:#1a1a1a;color:#ffcf00;text-decoration:none;font-weight:800;font-size:16px;padding:14px 22px;border-radius:12px">${button}</a></td></tr>
    <tr><td style="padding:12px 24px 24px;font-size:12px;line-height:1.5;color:#8a8a8a">Ovo je poruka o tvom oglasu na Kockolovu i šalje se uvek, nezavisno od podešavanja obaveštenja o porukama. Pitanja: ${escapeHtml(config.CONTACT_EMAIL)}</td></tr>
  </table></td></tr></table></body></html>`;
  const text = [hello, '', ...lines.flatMap((l) => [l, '']), `${button}: ${target}`].join('\n');
  return { subject, html, text };
}

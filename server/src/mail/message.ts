import { config } from '../config.js';
import { escapeHtml } from './format.js';

/** E-mail to the person who got a message about an ad: who wrote, the beginning of the text, a link to answer on the site. */
export function renderMessageMail(opts: { name: string; from: string; title: string; text: string; conversationId: number }) {
  const site = config.APP_URL.replace(/\/$/, '');
  const url = `${site}/poruke/${opts.conversationId}`;
  const snippet = opts.text.length > 200 ? `${opts.text.slice(0, 197)}…` : opts.text;
  const subject = `${opts.from} ti je poslao poruku za oglas „${opts.title}”`;
  const hello = opts.name ? `Ćao ${opts.name},` : 'Ćao,';
  const html = `<!doctype html><html lang="sr"><body style="margin:0;background:#f6f4ee;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f4ee"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden">
    <tr><td style="background:#ffcf00;padding:20px 24px"><div style="font-size:22px;font-weight:800">Kockolov</div><div style="font-size:13px;color:#3a3a3a">Oglasi</div></td></tr>
    <tr><td style="padding:24px 24px 8px">
      <div style="font-size:18px;font-weight:700">${escapeHtml(hello)}</div>
      <p style="font-size:15px;line-height:1.5;color:#333;margin:10px 0 0"><b>${escapeHtml(opts.from)}</b> ti je poslao poruku za oglas <b>„${escapeHtml(opts.title)}”</b>:</p>
      <p style="font-size:15px;line-height:1.5;color:#1a1a1a;margin:12px 0 0;padding:12px 14px;background:#f6f4ee;border-radius:12px;white-space:pre-line">${escapeHtml(snippet)}</p>
    </td></tr>
    <tr><td style="padding:16px 24px 8px"><a href="${escapeHtml(url)}" style="display:inline-block;background:#1a1a1a;color:#ffcf00;text-decoration:none;font-weight:800;font-size:16px;padding:14px 22px;border-radius:12px">Odgovori na Kockolovu</a></td></tr>
    <tr><td style="padding:12px 24px 24px;font-size:12px;line-height:1.5;color:#8a8a8a">Ne odgovaraj na ovaj e-mail, odgovor se piše na sajtu. Ako ima još poruka, javljamo najviše jednom na 15 minuta. Ne želiš ove e-mailove? Isključi ih u podešavanjima naloga: ${escapeHtml(site)}/nalog</td></tr>
  </table></td></tr></table></body></html>`;
  const text = [hello, '', `${opts.from} ti je poslao poruku za oglas „${opts.title}”:`, '', snippet, '', `Odgovori na Kockolovu: ${url}`, '', 'Ne odgovaraj na ovaj e-mail, odgovor se piše na sajtu. Ako ima još poruka, javljamo najviše jednom na 15 minuta. Ne želiš ove e-mailove? Isključi ih u podešavanjima naloga.'].join('\n');
  return { subject, html, text };
}

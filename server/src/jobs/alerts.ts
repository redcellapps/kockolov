import { config } from '../config.js';
import type { ShopRunSummary } from '../crawler/pipeline.js';
import { escapeHtml } from '../mail/format.js';
import { mailConfigured, sendMail } from '../mail/mailer.js';

/** E-mail the admin when a shop crawl failed or returned far fewer items than usual. */
export async function alertOnCrawlProblems(summaries: ShopRunSummary[], log: (m: string) => void = console.log) {
  const bad = summaries.filter((s) => s.status !== 'ok');
  if (!bad.length) return;
  const lines = bad.map((s) => `${s.shop}: ${s.status} — ${s.error ?? ''} (${s.items} proizvoda)`);
  log(`alert: ${lines.join(' | ')}`);
  if (!config.ADMIN_ALERT_EMAIL || !mailConfigured()) return;
  try {
    await sendMail({
      to: config.ADMIN_ALERT_EMAIL,
      subject: `Kockolov: problem sa preuzimanjem cena (${bad.map((b) => b.shop).join(', ')})`,
      text: `Jutarnje preuzimanje cena nije prošlo kako treba:\n\n${lines.join('\n')}\n\nPregled: ${config.APP_URL}/admin`,
      html: `<p>Jutarnje preuzimanje cena nije prošlo kako treba:</p><ul>${lines
        .map((l) => `<li>${escapeHtml(l)}</li>`)
        .join('')}</ul><p><a href="${config.APP_URL}/admin">Otvori administraciju</a></p>`,
    });
  } catch (err) {
    log(`alert: slanje nije uspelo: ${(err as Error).message}`);
  }
}

/** E-mail the admin when someone reports a conversation. Never throws: a failed mail must not fail the report. */
export async function alertConversationReport(p: { reporter: string; listingTitle: string; reason: string }, log: (m: string) => void = console.log) {
  if (!config.ADMIN_ALERT_EMAIL || !mailConfigured()) return;
  try {
    await sendMail({
      to: config.ADMIN_ALERT_EMAIL,
      subject: `Kockolov: prijavljen razgovor (${p.listingTitle})`,
      text: `${p.reporter} je prijavio razgovor o oglasu „${p.listingTitle}“.\n\nRazlog: ${p.reason}\n\nPregled: ${config.APP_URL}/admin/oglasi`,
      html: `<p><strong>${escapeHtml(p.reporter)}</strong> je prijavio razgovor o oglasu „${escapeHtml(p.listingTitle)}“.</p><p>Razlog: ${escapeHtml(p.reason)}</p><p><a href="${config.APP_URL}/admin/oglasi">Otvori administraciju</a></p>`,
    });
  } catch (err) {
    log(`alert: slanje prijave razgovora nije uspelo: ${(err as Error).message}`);
  }
}

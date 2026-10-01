import { config } from '../config.js';
import { one, query } from '../db.js';
import { todayLocal } from '../lib/time.js';
import { escapeHtml, reasonText, rsd, shopLabel, type Reason } from './format.js';
import { mailConfigured, sendMail } from './mailer.js';
import { eurRate, moneyFormatter } from '../fx.js';

interface DealRow {
  rank: number;
  set_num: string;
  name: string;
  theme_name: string | null;
  image_url: string | null;
  best_price_rsd: number;
  reference_price_rsd: number | null;
  reasons: Reason[];
  best_shop: string | null;
  best_seller: string | null;
}

interface WatchRow {
  set_num: string;
  name: string;
  best_price: number | null;
  best_shop: string | null;
  best_seller: string | null;
  price_yesterday: number | null;
}

export async function loadDigestData(userId: number, limit = 10) {
  const deals = await query<DealRow>(
    `SELECT d.rank, s.set_num, s.name, t.name AS theme_name, s.image_url, d.best_price_rsd, d.reference_price_rsd, d.reasons,
            o.shop_id AS best_shop, o.seller AS best_seller
       FROM deals d JOIN sets s ON s.set_num = d.set_num
       LEFT JOIN themes t ON t.slug = s.theme_slug
       LEFT JOIN offers o ON o.id = d.best_offer_id
      WHERE d.day = (SELECT max(day) FROM deals)
      ORDER BY d.rank LIMIT $1`,
    [limit],
  );
  const watched = await query<WatchRow>(
    `SELECT s.set_num, s.name, b.price_rsd AS best_price, b.shop_id AS best_shop, b.seller AS best_seller,
            (SELECT min(x.price_rsd) FROM (
               SELECT DISTINCT ON (ph.offer_id) ph.price_rsd, ph.in_stock
                 FROM price_history ph JOIN offers o2 ON o2.id = ph.offer_id
                WHERE o2.set_num = s.set_num AND ph.recorded_at < now() - interval '20 hours'
                ORDER BY ph.offer_id, ph.recorded_at DESC) x WHERE x.in_stock) AS price_yesterday
       FROM watchlist w JOIN sets s ON s.set_num = w.set_num
       LEFT JOIN LATERAL (
         SELECT price_rsd, shop_id, seller FROM offers o
          WHERE o.set_num = s.set_num AND o.active AND o.in_stock ORDER BY price_rsd LIMIT 1
       ) b ON true
      WHERE w.user_id = $1
      ORDER BY s.name`,
    [userId],
  );
  return { deals, watched };
}

/** Address of the page that turns the morning e-mail off for this user. */
export function unsubscribeUrl(token: string): string {
  return `${config.APP_URL.replace(/\/$/, '')}/odjava/${token}`;
}

export function renderDigest(
  name: string,
  data: Awaited<ReturnType<typeof loadDigestData>>,
  day: string,
  unsubscribe?: string,
  /** prices in the reader's currency; the note explains a converted (EUR) price */
  opts: { money?: (n: number | null | undefined) => string; fxNote?: string } = {},
) {
  const money = opts.money ?? rsd;
  const url = config.APP_URL.replace(/\/$/, '');
  const off = unsubscribe ?? `${url}/nalog`;
  const dayLabel = new Intl.DateTimeFormat('sr-Latn-RS', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${day}T12:00:00Z`),
  );
  const abs = (u: string) => (u.startsWith('/') ? `${url}${u}` : u);
  const hello = name ? `Dobro jutro, ${escapeHtml(name)}!` : 'Dobro jutro!';
  const dealRows = data.deals
    .map((d) => {
      const reasons = d.reasons.map((r) => reasonText(r, money)).filter(Boolean).slice(0, 2);
      const img = d.image_url
        ? `<img src="${escapeHtml(abs(d.image_url))}" width="88" height="88" alt="" style="display:block;width:88px;height:88px;object-fit:contain;border-radius:10px;background:#fff">`
        : '';
      return `<tr>
        <td style="padding:14px 0;border-bottom:1px solid #eee;width:96px;vertical-align:top">${img}</td>
        <td style="padding:14px 0 14px 12px;border-bottom:1px solid #eee;vertical-align:top">
          <div style="font-size:12px;color:#6b6b6b">${escapeHtml(d.set_num)}${d.theme_name ? ` · ${escapeHtml(d.theme_name)}` : ''}</div>
          <a href="${url}/set/${encodeURIComponent(d.set_num)}" style="font-size:16px;font-weight:700;color:#1a1a1a;text-decoration:none">${escapeHtml(d.name)}</a>
          <div style="margin-top:6px;font-size:18px;font-weight:800;color:#d01012">${money(d.best_price_rsd)}
            ${d.reference_price_rsd && d.reference_price_rsd > d.best_price_rsd ? `<span style="font-size:13px;font-weight:400;color:#8a8a8a;text-decoration:line-through;margin-left:6px">${money(d.reference_price_rsd)}</span>` : ''}
          </div>
          <div style="font-size:13px;color:#444">u prodavnici ${escapeHtml(shopLabel(d.best_shop ?? '', d.best_seller))}</div>
          ${reasons.map((r) => `<div style="font-size:12px;color:#1b7d3a;margin-top:3px">✓ ${escapeHtml(r)}</div>`).join('')}
        </td></tr>`;
    })
    .join('');

  const watchRows = data.watched
    .map((w) => {
      const delta = w.best_price !== null && w.price_yesterday !== null ? w.best_price - w.price_yesterday : null;
      const trend =
        delta === null || delta === 0
          ? '<span style="color:#8a8a8a">bez promene</span>'
          : delta < 0
            ? `<span style="color:#1b7d3a;font-weight:700">▼ ${money(-delta)}</span>`
            : `<span style="color:#b3261e">▲ ${money(delta)}</span>`;
      return `<tr><td style="padding:8px 0;border-bottom:1px solid #eee">
          <a href="${url}/set/${encodeURIComponent(w.set_num)}" style="color:#1a1a1a;text-decoration:none"><b>${escapeHtml(w.set_num)}</b> ${escapeHtml(w.name)}</a></td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${w.best_price ? money(w.best_price) : 'nema na stanju'}<br><span style="font-size:12px">${trend}</span></td></tr>`;
    })
    .join('');

  const html = `<!doctype html><html lang="sr"><body style="margin:0;background:#f6f4ee;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f4ee"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden">
    <tr><td style="background:#ffcf00;padding:20px 24px">
      <div style="font-size:22px;font-weight:800;color:#1a1a1a">Kockolov</div>
      <div style="font-size:13px;color:#3a3a3a">Jutarnji pregled najboljih LEGO ponuda · ${escapeHtml(dayLabel)}</div>
    </td></tr>
    <tr><td style="padding:20px 24px 4px">
      <div style="font-size:18px;font-weight:700">${hello}</div>
      <div style="font-size:14px;color:#444;margin-top:4px">Ovo su danas najisplativije kupovine u srpskim prodavnicama.</div>
    </td></tr>
    <tr><td style="padding:0 24px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${dealRows || '<tr><td style="padding:16px 0;color:#666">Danas nema izdvojenih ponuda.</td></tr>'}</table></td></tr>
    ${watchRows ? `<tr><td style="padding:24px 24px 4px"><div style="font-size:16px;font-weight:700">Setovi koje pratiš</div></td></tr>
    <tr><td style="padding:0 24px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:14px">${watchRows}</table></td></tr>` : ''}
    <tr><td style="padding:24px"><a href="${url}" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:10px">Otvori Kockolov</a></td></tr>
    <tr><td style="padding:0 24px 24px;font-size:12px;color:#8a8a8a">${opts.fxNote ? `${escapeHtml(opts.fxNote)}<br>` : ''}Ne želiš više ove poruke? <a href="${escapeHtml(off)}" style="color:#6b6b6b">Odjavi se jednim klikom</a>.<br>LEGO® je zaštićeni znak LEGO grupe; Kockolov nije povezan sa LEGO grupom.</td></tr>
  </table></td></tr></table></body></html>`;

  const text = [
    `${name ? `Dobro jutro, ${name}!` : 'Dobro jutro!'} Najbolje LEGO ponude danas (${dayLabel}):`,
    '',
    ...data.deals.map(
      (d) =>
        `${d.rank}. ${d.set_num} ${d.name} — ${money(d.best_price_rsd)} (${shopLabel(d.best_shop ?? '', d.best_seller)})\n   ${d.reasons
          .map((r) => reasonText(r, money))
          .filter(Boolean)
          .join('; ')}\n   ${url}/set/${d.set_num}`,
    ),
    ...(data.watched.length
      ? ['', 'Setovi koje pratiš:', ...data.watched.map((w) => `- ${w.set_num} ${w.name}: ${w.best_price ? money(w.best_price) : 'nema na stanju'}`)]
      : []),
    '',
    ...(opts.fxNote ? [opts.fxNote] : []),
    `Odjava sa jutarnjeg pregleda: ${off}`,
  ].join('\n');

  const top = data.deals[0];
  const subject = top
    ? `LEGO ponude dana: ${top.name} za ${money(top.best_price_rsd)}${data.deals.length > 1 ? ` i još ${data.deals.length - 1}` : ''}`
    : 'Kockolov: jutarnji pregled';
  return { subject, html, text };
}

/** Formatter and note for someone who reads prices in euros */
export async function currencyOpts(currency: 'RSD' | 'EUR') {
  if (currency !== 'EUR') return {};
  const fx = await eurRate();
  return {
    money: moneyFormatter('EUR', fx.rate),
    fxNote: `Cene u evrima su preračunate po srednjem kursu NBS (1 € = ${new Intl.NumberFormat('sr-RS', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(fx.rate)} RSD); prodavnice naplaćuju u dinarima.`,
  };
}

/** Send the morning digest to every user who has it enabled (once per day). */
export async function sendDigests(opts: { dryRun?: boolean; onlyEmail?: string; log?: (m: string) => void } = {}) {
  const log = opts.log ?? console.log;
  const day = todayLocal();
  const hasDeals = await one<{ n: number }>('SELECT count(*)::int AS n FROM deals WHERE day = $1', [day]);
  if (!hasDeals?.n) log(`digest: za ${day} još nema izračunatih ponuda — šaljem poslednje dostupne`);
  if (!mailConfigured() && !opts.dryRun) {
    log('digest: SMTP nije podešen (SMTP_HOST) — preskačem slanje');
    return { sent: 0, skipped: 0, failed: 0 };
  }
  const users = await query<{ id: number; email: string; name: string; unsubscribe_token: string; currency: 'RSD' | 'EUR' }>(
    `SELECT u.id, u.email, u.name, u.unsubscribe_token, u.currency FROM users u
      WHERE u.digest_enabled ${opts.onlyEmail ? 'AND u.email = $2' : 'AND u.accepted_at IS NOT NULL'}
        AND NOT EXISTS (SELECT 1 FROM digest_log l WHERE l.user_id = u.id AND l.day = $1 AND l.status = 'sent')`,
    opts.onlyEmail ? [day, opts.onlyEmail.toLowerCase()] : [day],
  );
  let sent = 0;
  let failed = 0;
  for (const u of users) {
    const data = await loadDigestData(u.id);
    const off = unsubscribeUrl(u.unsubscribe_token);
    const mail = renderDigest(u.name, data, day, off, await currencyOpts(u.currency));
    if (opts.dryRun) {
      log(`digest (dry-run) → ${u.email}: ${mail.subject}`);
      continue;
    }
    try {
      // one-click unsubscribe straight from the mail app (RFC 8058)
      const oneClick = `${config.APP_URL.replace(/\/$/, '')}/api/unsubscribe/${u.unsubscribe_token}`;
      await sendMail({
        to: u.email,
        ...mail,
        headers: { 'List-Unsubscribe': `<${oneClick}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      });
      await query(
        `INSERT INTO digest_log (user_id, day, status) VALUES ($1, $2, 'sent')
         ON CONFLICT (user_id, day) DO UPDATE SET status = 'sent', sent_at = now(), error = NULL`,
        [u.id, day],
      );
      sent++;
    } catch (err) {
      failed++;
      await query(
        `INSERT INTO digest_log (user_id, day, status, error) VALUES ($1, $2, 'failed', $3)
         ON CONFLICT (user_id, day) DO UPDATE SET status = 'failed', error = EXCLUDED.error`,
        [u.id, day, (err as Error).message],
      );
      log(`digest: greška za ${u.email}: ${(err as Error).message}`);
    }
  }
  log(`digest: poslato ${sent}, neuspešno ${failed}`);
  return { sent, skipped: 0, failed };
}

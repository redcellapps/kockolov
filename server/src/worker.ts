import cron from 'node-cron';
import { config } from './config.js';
import { migrate, query } from './db.js';
import { runCrawl } from './crawler/pipeline.js';
import { seedReferenceData } from './crawler/seed.js';
import { alertOnCrawlProblems } from './jobs/alerts.js';
import { refreshEurRate } from './fx.js';
import { sendDigests } from './mail/digest.js';
import { sendWatchAlerts } from './push/alerts.js';
import { instagramJob } from './social/instagram.js';
import { expireListings, purgeExpiredListings, purgeOldReports, sendExpiryReminders, sweepOrphanImages } from './listings/service.js';
import { mailConfigured, sendAccountMail } from './mail/mailer.js';
import { sendWelcomeMails } from './mail/welcome.js';

const log = (m: string) => console.log(`${new Date().toISOString()} ${m}`);

async function crawlJob() {
  try {
    log('posao: jutarnje preuzimanje cena');
    await refreshEurRate(log);
    const res = await runCrawl({ log });
    await alertOnCrawlProblems(res, log);
    await query('DELETE FROM sessions WHERE expires_at < now()');
    // sign-ups nobody confirmed within 30 days, and old one-time links
    await query("DELETE FROM users WHERE self_signup AND accepted_at IS NULL AND created_at < now() - interval '30 days'");
    await query("DELETE FROM user_tokens WHERE expires_at < now() - interval '30 days'");
  } catch (err) {
    log(`posao: preuzimanje nije uspelo: ${(err as Error).stack ?? err}`);
  }
}

/** Oglasi, once a day: reminders, ads that ran out, expired ads deleted after 30 days, loose pictures, old reports */
async function listingsJob() {
  if (config.LISTINGS_MODE === 'off') return;
  try {
    const send = async (m: { to: string; subject: string; html: string; text: string }) => {
      if (!mailConfigured()) throw new Error('SMTP nije podešen');
      await sendAccountMail(m);
    };
    const reminded = await sendExpiryReminders(send, log);
    const expired = await expireListings();
    const deleted = await purgeExpiredListings(send, log);
    const pics = await sweepOrphanImages();
    const reports = await purgeOldReports();
    log(`oglasi: podsetnika ${reminded}, isteklo ${expired}, obrisano oglasa ${deleted}, neiskorišćenih fotografija ${pics}, starih prijava ${reports}`);
  } catch (err) {
    log(`posao: oglasi nisu obrađeni: ${(err as Error).stack ?? err}`);
  }
}

/** Every minute: the welcome e-mail for accounts confirmed 10 minutes ago */
async function welcomeJob() {
  if (!mailConfigured()) return;
  try {
    const n = await sendWelcomeMails(sendAccountMail, log);
    if (n) log(`dobrodošlica: poslato ${n}`);
  } catch (err) {
    log(`posao: dobrodošlica nije poslata: ${(err as Error).stack ?? err}`);
  }
}

async function digestJob() {
  // phones first (quick), then the e-mails
  try {
    await sendWatchAlerts({ log });
  } catch (err) {
    log(`posao: obaveštenja na telefon nisu poslata: ${(err as Error).stack ?? err}`);
  }
  try {
    await sendDigests({ log });
  } catch (err) {
    log(`posao: slanje pregleda nije uspelo: ${(err as Error).stack ?? err}`);
  }
}

async function instagram() {
  try {
    await instagramJob(log);
  } catch (err) {
    log(`posao: instagram objava nije uspela: ${(err as Error).stack ?? err}`);
  }
}

async function main() {
  await migrate(log);
  await seedReferenceData();
  await refreshEurRate(log);
  cron.schedule(config.CRAWL_CRON, crawlJob, { timezone: config.TZ_NAME, name: 'crawl' });
  cron.schedule(config.DIGEST_CRON, digestJob, { timezone: config.TZ_NAME, name: 'digest' });
  cron.schedule(config.LISTINGS_CRON, listingsJob, { timezone: config.TZ_NAME, name: 'listings' });
  cron.schedule(config.WELCOME_CRON, welcomeJob, { timezone: config.TZ_NAME, name: 'welcome' });
  if (config.INSTAGRAM_CRON) cron.schedule(config.INSTAGRAM_CRON, instagram, { timezone: config.TZ_NAME, name: 'instagram' });
  log(
    `worker: preuzimanje "${config.CRAWL_CRON}", pregled "${config.DIGEST_CRON}", instagram "${config.INSTAGRAM_CRON || 'isključen'}", oglasi "${config.LISTINGS_CRON}" (${config.TZ_NAME})`,
  );
  if (process.argv.includes('--crawl-now')) await crawlJob();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

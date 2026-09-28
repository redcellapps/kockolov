import cron from 'node-cron';
import { config } from './config.js';
import { migrate, query } from './db.js';
import { runCrawl } from './crawler/pipeline.js';
import { seedReferenceData } from './crawler/seed.js';
import { alertOnCrawlProblems } from './jobs/alerts.js';
import { sendDigests } from './mail/digest.js';

const log = (m: string) => console.log(`${new Date().toISOString()} ${m}`);

async function crawlJob() {
  try {
    log('posao: jutarnje preuzimanje cena');
    const res = await runCrawl({ log });
    await alertOnCrawlProblems(res, log);
    await query('DELETE FROM sessions WHERE expires_at < now()');
  } catch (err) {
    log(`posao: preuzimanje nije uspelo: ${(err as Error).stack ?? err}`);
  }
}

async function digestJob() {
  try {
    await sendDigests({ log });
  } catch (err) {
    log(`posao: slanje pregleda nije uspelo: ${(err as Error).stack ?? err}`);
  }
}

async function main() {
  await migrate(log);
  await seedReferenceData();
  cron.schedule(config.CRAWL_CRON, crawlJob, { timezone: config.TZ_NAME, name: 'crawl' });
  cron.schedule(config.DIGEST_CRON, digestJob, { timezone: config.TZ_NAME, name: 'digest' });
  log(`worker: preuzimanje "${config.CRAWL_CRON}", pregled "${config.DIGEST_CRON}" (${config.TZ_NAME})`);
  if (process.argv.includes('--crawl-now')) await crawlJob();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

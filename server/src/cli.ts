import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { hashPassword, normalizeEmail } from './api/auth.js';
import { migrate, one, pool, query } from './db.js';
import { runCrawl } from './crawler/pipeline.js';
import { refreshSets } from './crawler/refresh.js';
import { seedReferenceData } from './crawler/seed.js';
import { computeDeals } from './deals/engine.js';
import { alertOnCrawlProblems } from './jobs/alerts.js';
import { writeFileSync } from 'node:fs';
import { loadDigestData, renderDigest, sendDigests } from './mail/digest.js';
import { todayLocal } from './lib/time.js';

const HELP = `Kockolov CLI

  migrate                                  primeni migracije baze
  crawl [lstore kockarium ananas]          preuzmi cene (podrazumevano sve prodavnice)
  refresh                                  ponovo izračunaj podatke o setovima
  deals                                    izračunaj današnje najbolje ponude
  digest [--dry-run] [--email x@y.rs]      pošalji jutarnji pregled
  digest --preview pregled.html [--email]  sačuvaj e-mail kao HTML (bez slanja)
  user:create --email x@y.rs [--name Ime] [--admin] [--password tajna]
  user:password --email x@y.rs [--password tajna]
  user:list
`;

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: {
      email: { type: 'string' },
      name: { type: 'string' },
      password: { type: 'string' },
      admin: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      preview: { type: 'string' },
    },
  });
  if (!cmd || cmd === 'help' || cmd === '--help') {
    console.log(HELP);
    return;
  }
  await migrate(() => {});
  await seedReferenceData();

  switch (cmd) {
    case 'migrate':
      console.log('Migracije su primenjene.');
      break;
    case 'crawl': {
      const res = await runCrawl({ shops: positionals.length ? positionals : undefined });
      console.table(res.map(({ durationMs, ...r }) => ({ ...r, sec: Math.round(durationMs / 1000) })));
      await alertOnCrawlProblems(res);
      break;
    }
    case 'refresh':
      await refreshSets();
      break;
    case 'deals':
      await computeDeals();
      break;
    case 'digest': {
      if (values.preview) {
        const u = await one<{ id: number; name: string; email: string }>(
          `SELECT id, name, email FROM users ${values.email ? 'WHERE email = $1' : 'ORDER BY id'} LIMIT 1`,
          values.email ? [normalizeEmail(values.email)] : [],
        );
        if (!u) throw new Error('Nema korisnika');
        const mail = renderDigest(u.name, await loadDigestData(u.id), todayLocal());
        writeFileSync(values.preview, mail.html);
        console.log(`${mail.subject}\n→ ${values.preview} (za ${u.email})`);
        break;
      }
      await sendDigests({ dryRun: values['dry-run'], onlyEmail: values.email });
      break;
    }
    case 'user:create': {
      if (!values.email) throw new Error('--email je obavezan');
      const email = normalizeEmail(values.email);
      if (await one('SELECT 1 FROM users WHERE email = $1', [email])) throw new Error(`Korisnik ${email} već postoji`);
      const password = values.password ?? randomBytes(9).toString('base64url');
      await query('INSERT INTO users (email, name, role, password_hash) VALUES ($1, $2, $3, $4)', [
        email, values.name ?? '', values.admin ? 'admin' : 'user', await hashPassword(password),
      ]);
      console.log(`Kreiran ${values.admin ? 'administrator' : 'korisnik'} ${email}`);
      if (!values.password) console.log(`Lozinka: ${password}`);
      break;
    }
    case 'user:password': {
      if (!values.email) throw new Error('--email je obavezan');
      const password = values.password ?? randomBytes(9).toString('base64url');
      const res = await query('UPDATE users SET password_hash = $2 WHERE email = $1 RETURNING id', [
        normalizeEmail(values.email), await hashPassword(password),
      ]);
      if (!res.length) throw new Error('Korisnik ne postoji');
      await query('DELETE FROM sessions WHERE user_id = $1', [res[0].id]);
      console.log(`Nova lozinka postavljena${values.password ? '' : `: ${password}`}`);
      break;
    }
    case 'user:list':
      console.table(await query('SELECT id, email, name, role, digest_enabled, last_login_at FROM users ORDER BY id'));
      break;
    default:
      console.log(HELP);
      process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());

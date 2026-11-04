#!/usr/bin/env node
/*
 * Kockolov KP agent: reads KupujemProdajem search pages from a computer that KP lets through
 * (KP answers 403 to the Kockolov server's data-centre address) and hands each page to the Kockolov
 * server, which parses it, decides which ads are LEGO sets and stores them. The agent itself knows
 * nothing about KP's pages: the server tells it which page to read next and when to stop, so this
 * file rarely needs updating.
 *
 * Node 18 or newer, no packages. Settings from the environment or from kp-agent.env next to this file:
 *   KOCKOLOV_URL=https://kockolov.rs        (or http://localhost:8080 for a local test)
 *   KP_AGENT_TOKEN=...                       (the same value as KP_AGENT_TOKEN in the server's .env)
 *
 *   node kp-agent.mjs            one run (schedule it twice a day)
 *   node kp-agent.mjs --uzorak   saves two search pages and one ad in ./kp-uzorak (for development)
 *
 * Polite on purpose (KP's rule: slowly, or "are you human" stops you): one request at a time, 6–10 s
 * apart (the server sets the pause), our real name in User-Agent, robots.txt respected, and the run
 * stops at once on 403, 429 or a check page.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));
const UA = 'KockolovBot/0.1 (+https://github.com/redcellapps/kockolov; LEGO price comparison)';
const KP = 'https://www.kupujemprodajem.com';
const FIRST_PAGE = `${KP}/igracke-i-igre/kockice/pretraga?keywords=lego&categoryId=1157&groupId=271`;

// ---- settings ----
const envFile = join(HERE, 'kp-agent.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const SERVER = (process.env.KOCKOLOV_URL ?? '').replace(/\/$/, '');
const TOKEN = process.env.KP_AGENT_TOKEN ?? '';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log(`${new Date().toISOString().slice(0, 19).replace('T', ' ')} ${m}`);

// ---- robots.txt (the rules for every robot, "User-agent: *") ----
let disallow = null;
async function allowed(url) {
  if (!disallow) {
    disallow = [];
    try {
      const res = await fetch(`${KP}/robots.txt`, { headers: { 'User-Agent': UA } });
      if (res.ok) {
        let mine = false;
        for (const raw of (await res.text()).split(/\r?\n/)) {
          const line = raw.replace(/#.*/, '').trim();
          const [k, ...rest] = line.split(':');
          const v = rest.join(':').trim();
          if (/^user-agent$/i.test(k)) mine = v === '*' || /kockolov/i.test(v);
          else if (mine && /^disallow$/i.test(k) && v) disallow.push(v);
        }
      }
    } catch {
      /* no robots.txt: nothing is off limits */
    }
  }
  const path = new URL(url).pathname + new URL(url).search;
  return !disallow.some((rule) => new RegExp(`^${rule.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}`).test(path));
}

async function getKp(url) {
  if (!(await allowed(url))) return { status: 0, html: '', error: 'robots.txt ne dozvoljava ovu adresu' };
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'sr-RS,sr;q=0.9' },
      signal: AbortSignal.timeout(30_000),
    });
    return { status: res.status, html: await res.text() };
  } catch (e) {
    return { status: 0, html: '', error: String(e?.message ?? e) };
  }
}

async function server(path, body) {
  const res = await fetch(`${SERVER}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
    body: gzipSync(JSON.stringify(body ?? {})),
    signal: AbortSignal.timeout(60_000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`server ${res.status}: ${json.error ?? ''}`);
  return json;
}

// ---- samples for development ----
async function samples() {
  const dir = join(process.cwd(), 'kp-uzorak');
  mkdirSync(dir, { recursive: true });
  const save = (name, r) => {
    writeFileSync(join(dir, name), r.html);
    log(`${name}: ${r.status}${r.error ? ` (${r.error})` : ''}, ${r.html.length} znakova`);
    return r;
  };
  const p1 = save('kp-strana-1.html', await getKp(FIRST_PAGE));
  if (p1.status !== 200) return log('KP ne pušta ovaj računar (status iznad). Pošalji Claude-u taj broj.');
  await sleep(8000);
  save('kp-strana-2.html', await getKp(`${FIRST_PAGE}&page=2`));
  const ad = p1.html.match(/href="(\/[^"]+\/oglas\/\d+)[^"]*"/)?.[1];
  if (ad) {
    await sleep(8000);
    save('kp-oglas.html', await getKp(`${KP}${ad}`));
  }
  log(`Gotovo. Fajlovi su u ${dir} — zakači ih u razgovor.`);
}

// ---- one run, page by page as the server says ----
async function run() {
  if (!SERVER || !TOKEN) {
    console.error('Nedostaje KOCKOLOV_URL ili KP_AGENT_TOKEN (u okruženju ili u kp-agent.env pored ovog fajla).');
    process.exit(2);
  }
  let { run: id, next, minDelayMs = 6000, maxDelayMs = 10000 } = await server('/api/kp/agent/start');
  log(`početak (run ${id})`);
  let pages = 0;
  try {
    while (next) {
      await sleep(minDelayMs + Math.random() * (maxDelayMs - minDelayMs));
      const r = await getKp(next);
      pages++;
      const answer = await server('/api/kp/agent/page', { run: id, url: next, status: r.status, html: r.html, error: r.error });
      if (answer.stop) log(`stop: ${answer.stop}`);
      ({ next } = answer);
      if (pages % 20 === 0) log(`${pages} stranica`);
    }
    const summary = await server('/api/kp/agent/finish', { run: id });
    log(`kraj: ${pages} stranica. ${summary.text ?? ''}`);
  } catch (e) {
    log(`greška: ${e.message}`);
    await server('/api/kp/agent/finish', { run: id, error: String(e.message) }).catch(() => {});
    process.exit(1);
  }
}

if (process.argv.includes('--uzorak')) await samples();
else await run();

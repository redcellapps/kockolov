# Kockolov

LEGO® price comparison for Serbian shops: a crawler (LEGO Store, Kockarium, Ananas) plus a web app
(search, filters, set pages with price history, watchlist, daily deals, morning e-mail).
Owner: Milan. UI language: Serbian, Latin script, **ekavica**; English comes later.

## Layout

- `server/` Node 22 + TypeScript (ESM, NodeNext), Fastify 5, pg, cheerio, zod, vitest
  - `src/crawler/adapters/*` one file per shop: pure parser + page-by-page adapter
  - `src/crawler/matching.ts` offer → set number; `pipeline.ts` upserts, history, safeguards
  - `src/deals/engine.ts` daily best buys; `src/mail/` morning digest; `src/api/` REST + auth
  - `src/worker.ts` cron (crawl 05:30, digest 07:00, Europe/Belgrade); `src/cli.ts` admin commands
  - `migrations/*.sql` applied automatically on start
- `web/` React 19, react-router 7, TanStack Query 5, Tailwind 4 (tokens in `src/index.css`), Vite 7
  - all UI text goes through `src/i18n/sr.ts` (`t()`, plural-aware `tn()`); never hard-code strings
  - `src/demo/` in-browser preview build (`npm run build:demo -w web`)
- `deploy/` production guides: `myvesta/` (current target: kockolov.rs on the myVesta server,
  nginx template → 127.0.0.1:3100) and a Caddy variant for a fresh server

## Local development

```bash
docker run -d --name kockolov-db -e POSTGRES_USER=kockolov -e POSTGRES_PASSWORD=kockolov \
  -e POSTGRES_DB=kockolov -p 5432:5432 postgres:16-alpine
echo DATABASE_URL=postgres://kockolov:kockolov@localhost:5432/kockolov > .env   # read by server/src/config.ts
npm install
npm run demo -w server -- --reset    # real shop snapshot of 28 Sep 2026; login demo@kockolov.local / demo1234
npm run dev:server                   # API on :8080
npm run dev:web                      # http://localhost:5173
npm run crawl                        # real crawl of the live shops (a few minutes)
```

## Checks before committing

```bash
npm run typecheck
npm test          # integration tests need TEST_DATABASE_URL (a separate, disposable database)
npm run build
```

## Conventions

- Crawling stays polite: robots.txt, ~1.2 s per host, honest User-Agent. New shop = new adapter +
  fixture pages in `server/test/fixtures/<shop>/` + parser tests.
- A shop returning nothing or under half of the last good run must never hide offers (see pipeline safeguards).
- Prices are integers in RSD. Set numbers are strings (`75192`, minifigure variants like `71051-7`).

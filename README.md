# Kockolov

Price comparison for LEGO® sets in Serbian shops. Every morning it crawls the shops, links the
same set across shops by its official set number, stores price history, picks the day's best buys
and e-mails them to users. The web app is in Serbian (Latin, ekavian); English comes later.

**Shops (round 1):** LEGO® Certified Store Srbija (lstore.rs, the official reference price),
Kockarium, Ananas (a marketplace; every seller there is tracked as its own offer: Spark,
BIG BANG, Dot Market, Pertini Toys, Toyzzz…).

Snapshot of the live shops on 28 Sep 2026: **983** different sets available somewhere,
**770** of them in at least two shops (549 in all three), and 99.6 % of the Kockarium/Ananas
sets also have a LEGO Store price to compare against. Ananas alone lists 1,569 LEGO items from
10 sellers; 1,244 carry a set number in the title, the rest are almost all merchandise.

## How it works

```
05:30  worker ── crawl ──> LEGO Store  (Shopify JSON feed, SKU = set number)
                        ─> Kockarium   (WooCommerce HTML, SKU on each card)
                        ─> Ananas      (search results embedded in the brand page)
        │
        ├─ match   SKU → set number in title → known set name (fallback)
        ├─ store   offers + price_history (a row only when price/stock changes)
        ├─ refresh set name / theme / image / reference price / search text
        └─ deals   score = % below LEGO Store + gap to next offer + new low + savings
07:00  worker ── morning e-mail ──> every user with the digest on (top deals + watched sets)
```

Safety rails in the crawler:

- robots.txt is checked, ~1.2 s between requests per host, retries with backoff, honest User-Agent.
- A shop that suddenly returns nothing is marked `failed`; one that returns under half of the
  last good run is `suspicious`. In both cases nothing is hidden or marked unavailable, and the
  admin gets an e-mail (`ADMIN_ALERT_EMAIL`).
- A listing missing in one run is shown as out of stock; after two missed runs it is hidden.
- Ananas paging is not stable, so it is walked in three sort orders and merged by listing id.
- Implausible prices (under 35 % of the reference) never become a "deal": they are usually a wrong match.

## Repository

```
server/            Node 22 + TypeScript (Fastify, pg, cheerio)
  migrations/      SQL migrations, applied automatically at start
  src/crawler/     adapters per shop, matching, pipeline, set refresh
  src/deals/       daily best-buy scoring
  src/mail/        morning digest (nodemailer)
  src/api/         REST API + auth (sessions, scrypt passwords)
  src/worker.ts    scheduler (crawl 05:30, digest 07:00, Europe/Belgrade)
  src/cli.ts       admin commands
  test/            unit tests + end-to-end test on recorded shop pages
web/               React 19 + Vite + Tailwind 4, Serbian UI (src/i18n/sr.ts)
```

## Deploy (Docker)

Production runs at **https://kockolov.rs** on a Hetzner server with Debian 13, Docker and Caddy
(automatic HTTPS): step-by-step guide in [deploy/README.md](deploy/README.md) (rebuild, DNS, Docker,
first start, mail, backups, updates). For a server that runs myVesta instead, see
[deploy/myvesta/README.md](deploy/myvesta/README.md).

Any other Docker host works the same way:

```bash
git clone git@github.com:redcellapps/kockolov.git && cd kockolov
cp .env.example .env          # set POSTGRES_PASSWORD, APP_URL, SMTP_*, ADMIN_ALERT_EMAIL
docker compose up -d --build

# first admin account (prints a generated password if --password is omitted)
docker compose exec app node server/dist/cli.js user:create --email you@example.com --name Milan --admin

# first crawl now instead of waiting for 05:30 (takes a few minutes)
docker compose exec worker node server/dist/cli.js crawl
```

The app listens on `127.0.0.1:${APP_PORT}` (default 3100). With `COMPOSE_FILE` from `.env.example`,
Caddy is started too and serves `DOMAIN` over HTTPS; keep `COOKIE_SECURE=true`.

### Private now, public later

`PUBLIC_MODE=false` (default): every page requires login; the admin creates accounts in
**Administracija → Korisnici** or with `user:create`. At launch set `PUBLIC_MODE=true`:
browsing becomes open, self sign-up turns on (override with `REGISTRATION_OPEN`), and accounts
stay for the watchlist and the morning e-mail.

### CLI

```bash
node server/dist/cli.js crawl [lstore kockarium ananas]   # crawl all or some shops
node server/dist/cli.js deals                              # recompute today's best buys
node server/dist/cli.js digest --dry-run                   # show who would get the e-mail
node server/dist/cli.js digest --email you@example.com     # send one digest now (test SMTP)
node server/dist/cli.js digest --preview /tmp/mail.html    # render the e-mail without sending
node server/dist/cli.js user:create --email x@y.rs [--admin] [--password ...]
node server/dist/cli.js user:password --email x@y.rs
node server/dist/cli.js user:list
```

## Try it locally with real data (no crawling)

`server/scripts/demo-data/` holds a snapshot of ~190 sets as they were listed in the three shops
on 28 Sep 2026. The demo serves them as fake shops, runs the normal pipeline three times with
shifted dates (so there is price history) and creates an admin account:

```bash
export DATABASE_URL=postgres://kockolov:kockolov@localhost:5432/kockolov
npm run demo -w server -- --reset      # login: demo@kockolov.local / demo1234
npm run dev:server & npm run dev:web   # open http://localhost:5173
```

Pictures are generated placeholders in the demo; the real crawl stores the shops' own images.

### Clickable preview without a server

The same demo data can be packed into one HTML file that answers the app's API calls in the
browser (search, filters, set pages, watchlist, admin), handy for showing the site to someone:

```bash
DATABASE_URL=... npx tsx server/scripts/export-demo.ts   # after npm run demo; writes web/src/demo/snapshot.json
npm run build:demo -w web                                # -> web/dist-demo/demo.html
```

## Development

```bash
npm install
# Postgres 16 with pg_trgm (any local instance), then:
export DATABASE_URL=postgres://kockolov:kockolov@localhost:5432/kockolov
npm run dev:server              # API on :8080 (migrates on start)
npm run dev:web                 # Vite on :5173, proxies /api
npm run cli -- user:create --email you@example.com --admin
npm run crawl                   # real crawl from your machine
npm test                        # unit + e2e (e2e needs TEST_DATABASE_URL, skipped otherwise)
```

## Adding a shop

1. `server/src/crawler/adapters/<shop>.ts`: export a parser (pure function, unit-testable)
   and an adapter that yields `RawOffer[]` page by page. Put the SKU in `sku` when the shop has one.
2. Register it in `adapters/index.ts` (the shop row is created automatically).
3. Save a page or two into `server/test/fixtures/<shop>/` and add parser tests.

Candidates already identified: Dexy Co, Kockalend, ePlaneta, Toyzzz, Pertini Toys, Shoppster.

## Roadmap

- Round 2: more shops, Rebrickable/Brickset enrichment (English names, pieces, year, EAN→set),
  manual-match review queue.
- Round 3: history-weighted deal scoring once there are 30+ days of data, price-drop alerts
  per watched set, English UI.

LEGO® is a trademark of the LEGO Group, which does not sponsor, authorize or endorse this project.

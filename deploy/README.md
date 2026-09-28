# Deploy on kockolov.rs (Hetzner server, fresh Debian 13)

The server behind 159.69.146.251 is rebuilt with Debian 13 and only runs Kockolov:

```
browser ─https─> Caddy (Let's Encrypt, automatic) ─> app ─> Postgres
                                                     worker (crawl 05:30, e-mail 07:00)
```

Everything runs in Docker Compose from this repository; the only thing outside Docker is a swap file.

## 1. Rebuild the server (Hetzner console)

Optional but cheap insurance: **Snapshots → Take snapshot** first (delete it later, it is billed monthly).

Then **Rebuild → Debian 13 → Rebuild**. It wipes the disk and keeps the IP address. Choose your SSH key
if you have one there; otherwise Hetzner shows/e-mails a new root password.

Reconnecting with PuTTY shows a "host key changed" warning: expected after a rebuild, accept it.

## 2. DNS for kockolov.rs

The old server was its own DNS server; the new one is not. Use Hetzner's DNS:

1. Hetzner console → **DNS** → add zone `kockolov.rs` → records:
   - `A  @    159.69.146.251`
   - `A  www  159.69.146.251`
2. At unlimited.rs → kockolov.rs → Nameservers: enter the nameservers the Hetzner zone page lists.

Check (can take an hour or two for .rs):

```bash
dig +short kockolov.rs @8.8.8.8        # → 159.69.146.251
```

## 3. Server basics (as root)

```bash
apt update && apt -y upgrade
apt -y install git curl unattended-upgrades       # unattended-upgrades = automatic security updates
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab   # 2 GB RAM + 2 GB swap is enough to build the app here
curl -fsSL https://get.docker.com | sh
```

## 4. Get the code (private repo → read-only deploy key)

```bash
ssh-keygen -t ed25519 -N "" -C "kockolov-server" -f /root/.ssh/kockolov_deploy
cat /root/.ssh/kockolov_deploy.pub
```

Add that line on GitHub: **redcellapps/kockolov → Settings → Deploy keys → Add deploy key**
(leave "Allow write access" off). Then:

```bash
cat >> /root/.ssh/config <<'EOF'
Host github-kockolov
  HostName github.com
  User git
  IdentityFile /root/.ssh/kockolov_deploy
  IdentitiesOnly yes
EOF
git clone github-kockolov:redcellapps/kockolov.git /opt/kockolov
```

## 5. Configure and start

```bash
cd /opt/kockolov
cp .env.example .env
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 24)/" .env
nano .env                        # ADMIN_ALERT_EMAIL now, SMTP_* in step 7; the rest is preset for kockolov.rs
docker compose up -d --build     # first build takes 5-10 minutes on this server
docker compose ps                # db, app, worker, caddy: all "running"/"healthy"
curl -s http://127.0.0.1:3100/api/health
```

`.env` contains `COMPOSE_FILE=docker-compose.yml:deploy/caddy/compose.yml`, so every `docker compose`
command includes Caddy. As soon as step 2 resolves, Caddy fetches the certificate by itself
(`docker compose logs caddy` shows it) and https://kockolov.rs shows the login page.

First account and first crawl:

```bash
docker compose exec app node server/dist/cli.js user:create --email you@example.com --name Milan --admin
docker compose exec worker node server/dist/cli.js crawl      # a few minutes; later every day at 05:30
```

## 6. Firewall (Hetzner console, optional)

**Firewalls → Create firewall**, inbound rules: TCP 22, TCP 80, TCP 443, UDP 443; apply it to the server.

## 7. Morning e-mail

The server has no mail server, and Hetzner blocks outgoing ports 25 and 465 anyway. Use a mail
service (Brevo, Postmark, Resend, Mailgun…) on port 587:

```
SMTP_HOST=<from the service>
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<from the service>
SMTP_PASS=<from the service>
MAIL_FROM=Kockolov <jutro@kockolov.rs>
```

Add the SPF/DKIM records the service gives you to the kockolov.rs zone in Hetzner DNS, then:

```bash
docker compose up -d
docker compose exec app node server/dist/cli.js digest --email you@example.com
```

## Updating

```bash
cd /opt/kockolov && git pull && docker compose up -d --build
```

## Backups

Nightly database dump, 14 days kept:

```bash
mkdir -p /backup/kockolov
cat > /etc/cron.d/kockolov-backup <<'EOF'
15 4 * * * root cd /opt/kockolov && docker compose exec -T db pg_dump -U kockolov kockolov | gzip > /backup/kockolov/kockolov-$(date +\%F).sql.gz && find /backup/kockolov -name '*.sql.gz' -mtime +14 -delete
EOF
```

These stay on the server; copy them elsewhere now and then (or turn on Hetzner's server backups).

## If something is off

- **Logs:** `docker compose logs -f app`, `... worker`, `... caddy`.
- **No certificate / browser warning:** DNS doesn't point here yet (`dig +short kockolov.rs @8.8.8.8`),
  or ports 80/443 are closed in the Hetzner firewall. Caddy keeps retrying by itself.
- **502 from Caddy:** the app container isn't running (`docker compose ps`, `docker compose logs app`).
- **Build killed:** the swap file from step 3 is missing (`swapon --show`).

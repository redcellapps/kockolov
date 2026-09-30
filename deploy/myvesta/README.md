# Deploy on kockolov.rs (Hetzner server with myVesta)

The server behind redcellapps.info (159.69.146.251) runs myVesta: nginx in front, Apache behind it
on 8080/8443, plus the server's own DNS and mail. Kockolov runs next to it in Docker and nginx
sends `kockolov.rs` to it:

```
browser ─https─> nginx (myVesta, template "kockolov") ─> 127.0.0.1:3100 ─> Kockolov container
                                                                          ├─ worker (crawl 05:30, e-mail 07:00)
                                                                          └─ Postgres (Docker volume)
```

**The server runs Debian 9** with Docker 19.03.15 + Compose v5, installed by myVesta's
`v-install-docker-service` (Debian 9 fix: myvesta/vesta@f9079a3). Docker 19.03 can't build the app's
Alpine-based image and its seccomp profile is outdated, so on this server:

- GitHub Actions builds the image on every push to `main` and publishes it as
  `ghcr.io/redcellapps/kockolov:latest`; the server only pulls it;
- `deploy/myvesta/compose.docker19.yml` switches app/worker to that image and turns seccomp off.

Later, after upgrading to Debian 12 (myVesta guides
[9→10](https://forum.myvestacp.com/viewtopic.php?f=28&t=815),
[10→11](https://forum.myvestacp.com/viewtopic.php?f=28&t=873),
[11→12](https://forum.myvestacp.com/viewtopic.php?f=28&t=877); not 13, myVesta doesn't support it yet)
with current Docker, drop the override and build on the server again.

Already done in myVesta (user `kockalov`): web domain `kockolov.rs` + `www`, DNS zone, mail domain
with DKIM.

## 1. Point the domain to the server (registrar)

In the unlimited.rs client area → kockolov.rs → Nameservers, set the same nameservers as
redcellapps.info:

```
redcellapps.fastcloudnetwork.com
redcellapps2.fastcloudnetwork.com
```

The DNS zone myVesta created then goes live (usually within an hour or two for .rs). Check:

```bash
dig +short kockolov.rs @8.8.8.8        # → 159.69.146.251
```

## 2. Docker, swap and registry login (once, as root)

```bash
docker --version && docker compose version     # 19.03.15 and v5.x on this server
# 2 GB swap: the server has ~850 MB free RAM and no swap
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

The image is private. Log in once with a GitHub token that can read packages (on GitHub: Settings →
Developer settings → Personal access tokens → Tokens (classic), scope `read:packages` only):

```bash
docker login ghcr.io -u <github-username>      # paste the token as the password
```

## 3. Get the code (private repo → read-only deploy key)

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

## 4. Configure and start

```bash
cd /opt/kockolov
cp .env.example .env
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 24)/" .env
echo 'COMPOSE_FILE=docker-compose.yml:deploy/myvesta/compose.docker19.yml' >> .env   # Docker 19.03 (Debian 9)
nano .env                              # ADMIN_ALERT_EMAIL, SMTP_* (step 7); keep DOMAIN commented
ss -tlnp | grep -q ':3100 ' && echo "3100 is taken: change APP_PORT and kockolov.stpl" || echo "3100 free"
docker compose pull                    # postgres + the ready-made app image
docker compose up -d
docker compose ps                      # db healthy, app and worker running
curl -s http://127.0.0.1:3100/api/health
```

The app listens on 127.0.0.1 only, so nothing is exposed past nginx.

## 5. nginx template (myVesta)

```bash
cp /opt/kockolov/deploy/myvesta/kockolov.tpl /opt/kockolov/deploy/myvesta/kockolov.stpl \
   /usr/local/vesta/data/templates/web/nginx/
/usr/local/vesta/bin/v-change-web-domain-proxy-tpl kockalov kockolov.rs kockolov
```

(or in the panel: **Web → kockolov.rs → Izmena → Proxy template: kockolov → Sačuvaj**)

## 6. HTTPS (after step 1 resolves)

Panel: **Web → kockolov.rs → Izmena → SSL podrška ✓ → Let's Encrypt podrška ✓ → Sačuvaj**, or:

```bash
/usr/local/vesta/bin/v-add-letsencrypt-domain kockalov kockolov.rs www.kockolov.rs
```

https://kockolov.rs now shows the login page. Create the first account and run the first crawl:

```bash
cd /opt/kockolov
docker compose exec app node server/dist/cli.js user:create --email you@example.com --name Milan --admin
docker compose exec worker node server/dist/cli.js crawl        # a few minutes; later every day at 05:30
```

## 7. Morning e-mail

Hetzner blocks outgoing port 25 on cloud servers unless a limit request was approved, and without
it the server's own mail can't reach Gmail & co. Check:

```bash
timeout 5 bash -c '</dev/tcp/gmail-smtp-in.l.google.com/25' && echo "port 25 open" || echo "port 25 blocked"
```

**Port 25 open → use the server's mail.** Panel: **Mail → kockolov.rs → add account `jutro`**, then in `.env`:

```
SMTP_HOST=mail.kockolov.rs
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=jutro@kockolov.rs
SMTP_PASS=<the mailbox password>
SMTP_TLS_INSECURE=true        # Exim uses the server's own certificate
MAIL_FROM=Kockolov <jutro@kockolov.rs>
```

**Port 25 blocked → use a mail service** (Brevo, Postmark, Resend, Mailgun…): put its SMTP host, port
587, user and password in `.env` (`SMTP_TLS_INSECURE=false`) and add the SPF/DKIM records it gives you
under **DNS → kockolov.rs** in the panel. (Or ask Hetzner to unblock port 25.)

Apply and test:

```bash
docker compose up -d
docker compose exec app node server/dist/cli.js digest --email you@example.com
```

## Updating

```bash
cd /opt/kockolov && git pull && docker compose pull && docker compose up -d
```

(on Debian 12 with current Docker and without the override: `git pull && docker compose up -d --build`)

## Backups

myVesta backups don't include Docker volumes. Nightly database dump, keeping 14 days:

```bash
mkdir -p /backup/kockolov
cat > /etc/cron.d/kockolov-backup <<'EOF'
15 4 * * * root cd /opt/kockolov && docker compose exec -T db pg_dump -U kockolov kockolov | gzip > /backup/kockolov/kockolov-$(date +\%F).sql.gz && find /backup/kockolov -name '*.sql.gz' -mtime +14 -delete
EOF
```

## If something is off

- **Logs:** `docker compose logs -f app` / `docker compose logs -f worker`.
- **502 Bad Gateway:** the container isn't running or APP_PORT doesn't match `kockolov.stpl`
  (`docker compose ps`, `curl -s http://127.0.0.1:3100/api/health`).
- **Crawler suddenly can't reach any shop:** a myVesta firewall change can wipe Docker's network
  rules. `systemctl restart docker` puts them back (containers restart by themselves).
- **"Operation not permitted" inside a container:** the `COMPOSE_FILE` line for Docker 19.03 is missing
  from `.env` (`docker compose config | grep seccomp` should show `seccomp=unconfined`).
- **`docker compose pull` says denied / not found:** `docker login ghcr.io` is missing, the token lacks
  `read:packages`, or the GitHub Actions run that publishes the image hasn't finished (Actions tab).

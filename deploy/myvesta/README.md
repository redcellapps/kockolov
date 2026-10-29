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

## 8. Public launch

1. myVesta → **Mail** → `kockolov.rs` → add two accounts:
   - `kontakt@kockolov.rs` (or a forward to an address you read): the privacy page and the footer
     list it as the contact for data requests
   - `nalog@kockolov.rs`: sender of sign-up confirmations, new-password links and invitations
     (`jutro@` stays the sender of the morning e-mail only)
2. In `/opt/kockolov/.env` add

   ```
   PUBLIC_MODE=true
   ACCOUNT_MAIL_FROM=Kockolov <nalog@kockolov.rs>
   ACCOUNT_SMTP_USER=nalog@kockolov.rs
   ACCOUNT_SMTP_PASS=<the nalog mailbox password>
   ```

   then `docker compose up -d`.
   - browsing works without an account; sign-up needs an e-mail confirmation link
   - `https://kockolov.rs/robots.txt` and `/sitemap.xml` open up for search engines
   - unconfirmed sign-ups are removed after 30 days (worker, with the morning crawl)
3. Check: open the site in a private window, sign up with a second address, confirm from the
   e-mail. Optionally submit `https://kockolov.rs/sitemap.xml` in Google Search Console.

To close sign-up again but keep the site public: `REGISTRATION_OPEN=false`.

## 9. Visitor statistics (Umami)

Counts visits without cookies, on your own server: pages, where visitors come from (e.g. `?utm_source=instagram`),
and whether they use the site in a browser, the installed site (PWA) or the Android/iOS app (tags `web`, `pwa`,
`app-android`, `app-ios`). Search words are never sent. Admins and "Do Not Track" browsers aren't counted.

1. **DNS:** an A record `stats.kockolov.rs` → 159.69.146.251 (the same place as step 1).
2. **Compose:** in `/opt/kockolov`
   ```bash
   git pull
   echo "UMAMI_APP_SECRET=$(openssl rand -hex 32)" >> .env
   sed -i 's#^COMPOSE_FILE=.*#&:deploy/myvesta/compose.umami.yml#' .env      # adds the Umami file to COMPOSE_FILE
   docker compose up -d db
   docker compose exec db psql -U kockolov -c "CREATE DATABASE umami"
   docker compose up -d umami
   curl -s http://127.0.0.1:3200/api/heartbeat                              # {"ok":true}
   ```
3. **nginx:** copy `umami.tpl` and `umami.stpl` to `/usr/local/vesta/data/templates/web/nginx/`, in myVesta add the web
   domain `stats.kockolov.rs` (proxy template "umami"), then enable Let's Encrypt SSL for it (as in step 6).
4. **Umami:** open https://stats.kockolov.rs, sign in with Umami's first-run account (name and password are in its
   documentation), change the password at once, then Settings → Websites → Add website (name Kockolov, domain
   kockolov.rs) and copy its **Website ID**.
5. **Kockolov:** in `.env` set `UMAMI_URL=https://stats.kockolov.rs` and `UMAMI_WEBSITE_ID=<the id>`, then
   `docker compose up -d --force-recreate app`. The site and the apps read these from the server, so an app
   update isn't needed.
6. Check: open kockolov.rs in a private window (not signed in as admin) and look at Umami → Realtime.

## 10. Instagram "set dana"

Every morning at 08:30 the worker picks a popular set (in stock at a public shop, with a picture, many shops carry
it or people watch it, a bonus for a real discount, a different theme than the last few posts, not repeated within
60 days) and makes a 1080×1350 picture and a caption. Prices in it come from the public shops only; the members-only
shops are just counted ("+ još 4 prodavnice uz nalog").

- **Without an Instagram account connected** (the default) the post waits on the admin page (Administracija →
  Instagram: set dana) and `ADMIN_ALERT_EMAIL` gets an e-mail with the picture and the caption. Save the picture,
  copy the text, post from the phone, then click "Objavio sam ručno". "Drugi set" picks another one.
- **To publish automatically** (once, ~15 minutes):
  1. Instagram app → Settings → Account type and tools → switch to a **professional account** (Creator or Business).
  2. https://developers.facebook.com/apps → Create app → use case "Manage messaging & content on Instagram"
     (type Business). In the app: Instagram → **API setup with Instagram login** → "Generate access tokens" →
     Add account → sign in with the Kockolov Instagram account. If Meta sends a tester invite instead, accept it at
     https://www.instagram.com/accounts/manage_access/ (Tester invites) and come back.
  3. Same place → **Generate token** for the account (permissions `instagram_business_basic` and
     `instagram_business_content_publish`). Copy the long-lived token (usually starts with `IGAA`).
  4. Administracija → Instagram nalog → paste it → Poveži. From the next morning posts go out by themselves.
     The server renews the token every week (it would otherwise expire after 60 days); "Pauziraj" stops it for a while.
  Standard access is enough for an account you own and added to the app, so no app review is needed.
  Instagram must reach `https://kockolov.rs/og/ig/<id>.jpg` (it fetches the picture from there).
- Put `kockolov.rs` (with `?utm_source=instagram`) in the profile's bio: the captions say "link u bio-u".
- Another time: `INSTAGRAM_CRON=0 9 * * *` in `.env`, then `docker compose up -d worker`; empty turns it off.

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

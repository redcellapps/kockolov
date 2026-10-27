# Kockolov za Smart TV

Jedna Lightning 3 / Blits aplikacija (1920×1080, daljinski) koja se pakuje za **Samsung Tizen** (.wgt) i
**LG webOS** (.ipk). Čita isti REST API kao sajt i mobilne aplikacije (https://kockolov.rs/api). Verzija 1 je
bez prijave: početna (ponuda dana, najveći popusti, teme), pretraga, teme, stranica seta (ponude, istorija
cene, QR za telefon) i O aplikaciji. Faza 2 dodaje prijavu kodom (vidi dole): posle nje se vide sve prodavnice,
praćeni setovi, dugme „Prati cenu“ na setu i cene u EUR ako je tako podešeno u nalogu.

Podržani televizori: Samsung od 2018 (Tizen 4.0, Chromium 56) i LG od 2018 (webOS 4.x, Chromium 53).
Build je jedan ES5 paket sa polyfill-ima (`@vitejs/plugin-legacy`, cilj `chrome >= 53`).

## Lokalno pokretanje

```bash
cd tv
npm install              # tv/ je poseban npm projekat, nije workspace korena
npm run dev              # http://localhost:5174 — tastatura: strelice, Enter, Esc/Backspace = Nazad, 0–9
```

`.env.development` upire API na `http://localhost:8080` (lokalni server iz korena repoa: `npm run demo -w server -- --reset`
pa `npm run dev:server`; u `.env` korena dodaj `APP_ORIGINS=capacitor://localhost,https://localhost,http://localhost:5174`
da lokalni server pusti CORS za dev server). Bez `.env.development` aplikacija zove https://kockolov.rs, ali
pregledač na `localhost` ne dobija CORS, pa za pregled produkcijskih podataka koristi `vite preview` sa proksijem:

```bash
VITE_API_BASE=/ npx vite build --outDir dist-shots && npx vite preview --outDir dist-shots --port 5175 --host
```

(`VITE_API_BASE` = bilo šta što nije `http(s)://` adresa znači „isti origin“; u Git Bash-u na Windowsu `/`
postane `C:/Program Files/Git/`, što je svejedno. Ako se `vite preview` u Git Bash-u odmah ugasi, pokreni ga
iz PowerShell-a ili dodaj `< /dev/null`.)

Provere: `npm run typecheck`, `npm test` (vitest: formatiranje cena, množina, grafikon, mapiranje API-ja),
`node scripts/shots.mjs [url] [folder]` pravi screenshotove 1920×1080 (traži Playwright: `npm i --no-save playwright && npx playwright install chromium`).

## Struktura

```
src/index.ts            Blits.Launch (fontovi, keymap sa platforme, GPU memorija)
src/App.ts              rute (/, /set/:setnum, /pretraga, /teme, /teme/:slug, /o-aplikaciji)
src/i18n/sr.ts          SAV tekst aplikacije (latinica, ekavica); t(), tn() u i18n/index.ts
src/api/                client.ts (fetch + keš 5 min, slike /media/set/<broj>.jpg?w=), types.ts
src/lib/                format.ts (4.792 RSD), history.ts (grafikon), qr.ts
src/platform/           tizen.ts, webos.ts, browser.ts — kodovi tastera i izlaz iz aplikacije
src/components/         TopBar, Hero, Row, Grid, SetCard, ThemeCard, Keyboard, OfferList, PriceChart, ExitDialog, Status
src/pages/              Home, Set, Search, Themes, ThemeSets, About
public/fonts/           Plus Jakarta Sans kao MSDF atlasi (generisani jednom, vidi fonts-src/)
platforms/tizen/        config.xml (+ ikona); platforms/webos/ appinfo.json, ikone, splash
scripts/                build-tizen.mjs, build-webos.mjs, shots.mjs
```

Pravila iz Blits-a koja su koštala vremena: u template stringu nema `${}` (precompiler čita template pre JS-a,
boje i dimenzije stoje literalno); tekstura na nevidljivom čvoru se ne učita (placeholder ide iza slike, ne
preko nje); nizovi za `:for` žive u `state`, ne u `computed`; promenljiva u `:for` ne sme da se zove `key`;
ruter spušta putanje u mala slova (`:setnum`); prelazi između stranica su trenutni (animirani fade je u
pregledaču ostajao na pola).

Fontovi: `fonts-src/` sadrži TTF-ove (OFL), `charset.config.json` (ASCII + čćšžđ + evropski akcenti) i `generate.mjs`.
Atlasi se prave jednom (`@lightningjs/msdf-generator` traži nativni `canvas`, pa nije zavisnost):

```bash
mkdir /tmp/msdf && cd /tmp/msdf && npm init -y && npm i @lightningjs/msdf-generator
cp -r <repo>/tv/fonts-src font-src && mkdir font-dst && cp font-src/generate.mjs . && node generate.mjs
cp font-dst/*.msdf.* <repo>/tv/public/fonts/
```

## Pakovanje

```bash
npm run build                      # dist/ (ES5, relativne putanje, bez crossorigin)
npm run build:webos                # build/webos/rs.kockolov.tv_<verzija>_all.ipk  (ares-package iz @webos-tools/cli)
TIZEN_PACKAGE_ID=XXXXXXXXXX TIZEN_PROFILE=kockolov npm run build:tizen   # build/tizen/Kockolov.wgt (potpisan)
npm run build:tizen                # bez tizen CLI-ja ili profila: NEPOTPISAN .wgt, samo za uvid
```

Verzija oba paketa je `version` iz `package.json`. ID aplikacija: webOS `rs.kockolov.tv`; Tizen
`<paket>.Kockolov`, gde je paket 10 znakova koje dodeljuje Samsung Seller Office (u razvoju `kockolovTV`).

### GitHub Actions (`.github/workflows/tv.yml`)

Na svaki push u `tv/` (grane `main` i `tv`): typecheck, testovi, build, screenshotovi (artefakt `tv-screenshots`),
`.ipk` i `.wgt` (artefakt `tv-packages` i pre-release **tv-test** sa `kockolov-tv.ipk` i `kockolov-tv.wgt`).

Tizen potpisivanje radi kad postoje secrets `TIZEN_AUTHOR_P12_BASE64`, `TIZEN_AUTHOR_PASSWORD`,
`TIZEN_DISTRIBUTOR_P12_BASE64`, `TIZEN_DISTRIBUTOR_PASSWORD` (sertifikati iz Tizen Studio Certificate
Manager-a: autorski + Samsung distributerski sa DUID-ovima televizora za razvoj; `base64 -w0 fajl.p12`).
Bez njih CI pravi nepotpisan .wgt. Repository variable `TIZEN_PACKAGE_ID` = paket iz Seller Office-a.
Ključevi i sertifikati nikad ne idu u repo.

## Instalacija na TV u developer modu

### LG webOS

1. Na TV-u: instaliraj **Developer Mode** iz LG Content Store-a, prijavi se LG developer nalogom, uključi
   *Dev Mode Status* i *Key Server*, restartuj TV. Zapamti IP televizora i *Passphrase*.
2. Na računaru: `npm i -g @webos-tools/cli`, pa
   ```bash
   ares-setup-device --add tv -i "host=<IP>" -i "port=9922" -i "username=prisoner"
   ares-novacom --device tv --getkey        # unese se passphrase sa TV-a
   ares-install --device tv kockolov-tv.ipk
   ares-launch --device tv rs.kockolov.tv
   ares-inspect --device tv --app rs.kockolov.tv --open   # DevTools
   ```
3. Developer mode ističe posle 50 sati; produži u Developer Mode aplikaciji na TV-u.

### Samsung Tizen

1. Na TV-u: Apps → unesi `12345` na daljinskom → Developer mode **On**, upiši IP računara, restartuj TV.
2. Na računaru: Tizen Studio (ili samo web-cli) + Device Manager: *Remote Device Manager* → dodaj IP televizora →
   poveži → desni klik → *Permit to install applications*. Certificate Manager: Samsung sertifikat (author +
   distributor; distributerski mora da sadrži DUID televizora koji se vidi u Device Manager-u).
3. Paket mora biti potpisan tim profilom (CI sa secrets, ili lokalno `TIZEN_PROFILE=<profil> npm run build:tizen`), pa:
   ```bash
   sdb connect <IP>
   tizen install -n Kockolov.wgt -t <naziv uređaja iz 'sdb devices'>
   tizen run -p <paket>.Kockolov -t <uređaj>
   ```
   Web Inspector: Device Manager → desni klik na aplikaciju → *Inspect*.
4. Bez računara, sa USB-a: Developer mode **On** na TV-u, `.wgt` u folder `userwidget` u korenu FAT32 USB-a,
   USB u TV → aplikacija se instalira sama (Apps → ikona; ponekad treba restart). Da li ovaj put prima i
   *nepotpisan* paket iz CI-ja (`tv-test` release) nije provereno — ako TV odbije, dodaj autorski sertifikat
   u GitHub secrets pa CI potpisuje svaki paket.

## Predaja u prodavnice

### Samsung Seller Office (https://seller.samsungapps.com)

- Nalog: Samsung Account → Seller Office → TV Seller Office; za komercijalnu objavu potrebna je verifikacija
  prodavca (pojedinac može).
- *Create App* → dobija se **Application ID / package** (10 znakova) → upisati u repository variable
  `TIZEN_PACKAGE_ID` i ponovo napraviti paket.
- Potrebno: potpisan .wgt (distributer **Samsung** sertifikat, ne Tizen), ikona (512×423 za Smart Hub i
  1920×1080 pozadina po potrebi), screenshotovi 1920×1080, opis na engleskom (+ srpski), kategorija
  (Lifestyle / Shopping), zemlje (Srbija), uzrast, politika privatnosti (https://kockolov.rs/privatnost),
  kontakt. Samsung testira aplikaciju na uređajima (obično 1–2 nedelje); izveštaj stiže u Seller Office.
- Napomene za pregledače: Back na početnoj otvara dijalog za izlaz; dug pritisak Return/Exit uvek gasi
  aplikaciju (ne presrećemo); brojevi na daljinskom su registrovani preko tvinputdevice.

### LG Seller Lounge (https://seller-lgapps.com)

- Nalog: LG developer nalog → Seller Lounge → *App Management* → *Register App* (webOS TV).
- Potrebno: `.ipk` (nepotpisan — LG potpisuje), ikona 400×400, pozadina/bg slike po njihovom spisku (vidi
  *App Submission Guidelines* u Seller Lounge-u), screenshotovi 1920×1080, opis, kategorija, zemlje,
  uzrast, politika privatnosti, kontakt za QA, testni koraci.
- `appinfo.json` već ima `requiredACG: []` (aplikacija ne zove Luna API-je) i `disableBackHistoryAPI: true`.
- LG QA proverava rad na nekoliko webOS verzija (test se vraća sa izveštajem ako nešto padne); nova verzija =
  veći `version` u package.json.

## Statistika poseta

Ista Umami statistika kao na sajtu (bez kolačića i ličnih podataka): aplikacija šalje po jedan pregled
stranice na svaku promenu rute (`src/lib/analytics.ts`, samo putanja tipa `/set/75192`, nikad upit pretrage)
direktno na `<UMAMI_URL>/api/send`, sa tagom `tv-tizen` / `tv-webos`, i događaj `tv-uparen` kad se TV upari.
Adresu i ID sajta dobija iz `/api/auth/me` (`analytics`); dok server to ne vrati, ništa se ne šalje.

## Prijava na TV-u (faza 2)

Lozinka se nikad ne kuca na daljinskom. Meni → **Prijava**: TV zatraži `POST /api/tv/pair` i prikaže
6-znakovni kod i QR ka `https://kockolov.rs/tv?kod=…`. Korisnik na telefonu (prijavljen na sajt) potvrdi kod;
TV anketira `GET /api/tv/pair/:kod?secret=…` na 3 s i, kad dobije `confirmed`, čuva token u
`localStorage` (`kockolov.tv.session`) i od tada šalje `x-kockolov-app: tv` + `Authorization: Bearer`.
Kod važi 10 minuta; posle isteka „Novi kod“. Pri startu aplikacija proverava token kroz `/api/me`
(i uzima valutu + kurs); nevažeći token briše sesiju.

Posle prijave: svih 17 prodavnica, meni dobija **Praćeno** i **Nalog**, set ima „Prati cenu“ / „Pratiš“,
početna red „Praćeno: pojeftinilo“. **Nalog → Odjavi televizor** poziva `/api/logout` i briše sesiju; uređaj
se može ukloniti i na sajtu (Nalog → Televizor). Server: `migrations/011_tv_pairing.sql`,
`src/api/routes/tv.ts`.

# Kockolov — Android i iOS aplikacija

Ista web aplikacija (`web/`, build `npm run build:app -w web` → `web/dist-app`) u Capacitor ljusci.
Podaci stižu sa `https://kockolov.rs` (API sa tokenom umesto kolačića), a aplikacija dodaje:

- obaveštenja preko Firebase Cloud Messaging (Android i iOS), kad set iz Praćenog pojeftini ili se vrati na stanje;
- skener bar-koda sa LEGO kutije (Google-ov skener na Androidu, kamera na iPhone-u) → stranica tog seta;
- dugme „nazad” na Androidu, otvaranje kockolov.rs linkova u aplikaciji.

## Build

GitHub Actions (`.github/workflows/mobile.yml`) na svaki push u `mobile/` ili `web/`:

- **Android**: debug APK kao artifact `kockolov-android-debug` (instalira se direktno na telefon);
- **iOS**: provera da se projekat kompajlira (bez potpisa).

Lokalno (Android Studio / Xcode):

```bash
npm ci && (cd mobile && npm ci)
cd mobile && npm run android   # ili: npm run ios (macOS, CocoaPods)
```

Ikonice i splash ekrani: `node scripts/make-assets.mjs` (crta ih iz Kockolov znaka).

## Obaveštenja (Firebase)

1. Firebase projekat → dodati Android aplikaciju `rs.kockolov.app` i iOS aplikaciju `rs.kockolov.app`.
2. `google-services.json` i `GoogleService-Info.plist` → GitHub secrets `GOOGLE_SERVICES_JSON` i `GOOGLE_SERVICE_INFO_PLIST`
   (Settings → Secrets and variables → Actions). Fajlovi se ne commit-uju.
3. iOS: Apple Developer → Keys → APNs ključ (.p8) → Firebase → Project settings → Cloud Messaging → Apple app configuration.
4. Server: Firebase → Project settings → Service accounts → Generate new private key → u `/opt/kockolov/.env`
   `FCM_SERVICE_ACCOUNT=` sadržaj fajla kodiran u base64 (`base64 -w0 kljuc.json`), pa `docker compose up -d`.

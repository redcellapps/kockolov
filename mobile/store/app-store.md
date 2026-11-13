# Kockolov na App Store-u (iPhone)

iOS build se pravi i potpisuje na GitHub-u (macOS mašina sa Xcode 26), bez Mac-a: Actions → Mobile apps →
**Verzija za App Store** → build stiže u App Store Connect → TestFlight → pregled → App Store.
Aplikacija je samo za iPhone (bez iPad-a), verzija iz `mobile/package.json` (ista kao Android).

## 1. Jednom: Apple nalog

1. **developer.apple.com → Account → Membership details**: zapiši **Team ID** (10 znakova).
2. **Certificates, Identifiers & Profiles → Identifiers → +** → App IDs → App → Bundle ID *Explicit*
   `rs.kockolov.app`, Description „Kockolov”, Capabilities: **Push Notifications**. Register.
3. **Keys → +** → ime „Kockolov APNs”, štikliraj **Apple Push Notifications service (APNs)** → Continue → Register →
   **Download** (`AuthKey_XXXXXXXXXX.p8`, može samo jednom). Zapiši Key ID.
   Firebase → Project settings → **Cloud Messaging** → Apple app configuration → *APNs Authentication Key* →
   upload tog `.p8`, Key ID i Team ID.
4. Firebase → Project settings → General → ako nema iOS aplikacije `rs.kockolov.app`: **Add app → iOS**, bundle
   `rs.kockolov.app`, nadimak „Kockolov iOS”. Skini **GoogleService-Info.plist**.
5. **App Store Connect → Users and Access → Integrations → App Store Connect API → Team Keys → +** → ime
   „Kockolov GitHub”, Access **Admin** (Admin treba da bi GitHub sam napravio sertifikat i profil za potpis) →
   Generate → **Download API Key** (`AuthKey_YYYYYYYYYY.p8`, opet samo jednom). Zapiši **Key ID** i **Issuer ID**
   (gore na toj stranici).
6. **App Store Connect → Business**: prihvati *Free Apps Agreement* ako stoji kao „Action needed”. Porez i banka za
   besplatnu aplikaciju ne trebaju.

## 2. Jednom: GitHub secrets

GitHub → Settings → Secrets and variables → **Actions → New repository secret**:

| Secret | Vrednost |
|---|---|
| `ASC_KEY_ID` | Key ID API ključa iz koraka 5 |
| `ASC_ISSUER_ID` | Issuer ID iz koraka 5 |
| `ASC_KEY_P8` | ceo sadržaj `AuthKey_YYYYYYYYYY.p8` (otvori u TextEdit-u ili Notepad-u, kopiraj sve sa BEGIN/END redovima) |
| `APPLE_TEAM_ID` | Team ID iz koraka 1 |
| `GOOGLE_SERVICE_INFO_PLIST` | ceo sadržaj `GoogleService-Info.plist` (ako već nije postavljen) |

Ne meša se APNs ključ (korak 3, ide samo u Firebase) i API ključ (korak 5, ide u GitHub).

## 3. Aplikacija u App Store Connect-u

**Apps → + → New App**: Platform **iOS**, Name **Kockolov**, Primary language **English (U.S.)** (srpski ne postoji u
App Store Connect-u; tekst ispod je na srpskom), Bundle ID `rs.kockolov.app`, SKU `kockolov-ios`, User access Full.

**App Information**
- Subtitle (30): `Cene LEGO® setova u Srbiji`
- Category: **Shopping**, sekundarna *Lifestyle*
- Content rights: ne sadrži sadržaj trećih strana za koji trebaju prava (slike setova su iz prodavnica / javne kataloške)
- Age rating: sve „None”, osim *User-generated content* (Oglasi, poruke) = **Yes** → 12+ ili kako upitnik izračuna
- **Trader status (EU DSA)**: *not a trader* (besplatna lična aplikacija, kao na Google Play-u); promeni kad aplikacija
  počne da zarađuje

**App Privacy** → Privacy Policy URL `https://kockolov.rs/privatnost` → Get Started → *Yes, we collect data*:

| Podatak (Apple) | Linked to user | Tracking | Svrha |
|---|---|---|---|
| Contact Info → **Email Address** | Yes | No | App Functionality |
| Contact Info → **Name** | Yes | No | App Functionality |
| Contact Info → **Phone Number** (Oglasi, nije obavezan) | Yes | No | App Functionality |
| User Content → **Photos or Videos** (slike oglasa) | Yes | No | App Functionality |
| User Content → **Emails or Text Messages** (poruke kupac–prodavac) | Yes | No | App Functionality |
| User Content → **Other User Content** (tekst oglasa) | Yes | No | App Functionality |
| Identifiers → **User ID** | Yes | No | App Functionality |
| Usage Data → **Product Interaction** (samo ako je Umami uključen na serveru) | No | No | Analytics |

Tracking: **No** (nema reklama ni deljenja sa trećim stranama).

**Pricing and Availability**: Free, sve zemlje (kao na Play-u) ili samo Srbija.

## 4. Build → TestFlight

GitHub → **Actions → Mobile apps → Run workflow** (`main`) → štikliraj **Verzija za App Store** → Run.
Za ~15–20 min build je u App Store Connect-u; posle Apple-ove obrade (10–30 min) vidi se u **TestFlight**.

- **Export compliance**: već odgovoreno u aplikaciji (`ITSAppUsesNonExemptEncryption = NO`, koristi se samo HTTPS).
- **TestFlight → Internal Testing → +** grupa „Tim”, dodaj sebe (i do 100 ljudi sa App Store Connect pristupom) →
  build → na iPhone-u aplikacija **TestFlight** → instaliraj Kockolov.
- Proveri: prijava (mejl), pretraga, skener (dozvola za kameru), Nalog → obaveštenja + probno obaveštenje,
  Podeli, Oglasi (slika iz galerije i kamerom, poruka, blokiranje), link kockolov.rs iz Notes-a.

Svaki build ima veći broj (build number), verzija se menja u `mobile/package.json`.

## 5. Slanje na pregled

App Store → verzija **1.2.0**:

- **Screenshots**: 6,9" iPhone (1320 × 2868 ili 1290 × 2796), 3–10 slika. iPad nije potreban (aplikacija je samo za iPhone).
- **Promotional Text** (170, menja se bez novog pregleda):
  ```
  Novo: Oglasi! Prodaj svoje LEGO® setove ili pronađi korišćene, sa porukama u aplikaciji.
  ```
- **Description**:
  ```
  Kockolov upoređuje cene LEGO® setova u prodavnicama u Srbiji: LEGO® Store, Kockarium, Ananas i još desetak drugih. Ukucaj naziv ili broj seta, ili skeniraj bar-kod sa kutije, i odmah vidiš gde je set najjeftiniji i koliko štediš.

  ŠTA DOBIJAŠ
  • Sve ponude za isti set na jednom mestu, od najjeftinije
  • Uštedu u odnosu na redovnu cenu u LEGO® Store-u i najnižu cenu koju smo zabeležili
  • Istoriju cene za svaki set
  • Ponude dana: svakog jutra najveći popusti
  • Skener bar-koda: u radnji skeniraj kutiju i proveri da li je cena dobra
  • Praćenje setova: obaveštenje na telefonu čim set pojeftini ili se vrati na stanje
  • Oglasi: prodaj svoje setove ili kupi korišćene, sa slikama i porukama u aplikaciji

  KAKO RADI
  Cene proveravamo svakog jutra, direktno na sajtovima prodavnica. Kupuješ u prodavnici koju izabereš: Kockolov ništa ne prodaje i ništa ne naplaćuje.

  LEGO® je zaštićeni znak LEGO grupe, koja ne sponzoriše Kockolov, ne odobrava ga niti je povezana sa njim.
  ```
- **Keywords** (100): `lego,kocke,cene,akcija,popust,setovi,igračke,poklon,oglasi,skener,uporedi,kupovina,srbija`
- **Support URL**: `https://kockolov.rs` (kontakt: kontakt@kockolov.rs je u podnožju i u Politici privatnosti), **Marketing URL**: `https://kockolov.rs`
- **Copyright**: `2026 Milan Djordjevic`
- **App Review Information**: Sign-in required **Yes** → demo nalog (običan nalog sa par praćenih setova; ne admin).
  Notes:
  ```
  Kockolov compares prices of LEGO sets across shops in Serbia (the app UI is in Serbian). Sign in with the demo account to see the watchlist, notifications settings (Nalog → Kockolov na telefonu) and Oglasi (user classified ads). Users can report ads and conversations and block other users (ad page or conversation; list on the Nalog page). Account deletion: Nalog → Brisanje naloga. The barcode scanner (Skeniraj kutiju) uses the camera only to read the box barcode.
  ```
- Build → izaberi build iz TestFlight-a → **Add for Review → Submit**. Prvi pregled obično 1–3 dana.

## Napomene

- Prijava preko Google-a je u aplikacijama sakrivena (Google ne dozvoljava prijavu u web prikazu aplikacije, a Apple bi
  uz nju tražio i „Sign in with Apple”, pravilo 4.8). Na sajtu ostaje.
- Universal Links (kockolov.rs linkovi otvaraju aplikaciju na iPhone-u) dolaze kasnije, kao App Links na Androidu.

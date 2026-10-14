# Kockolov na Google Play-u

Vodič za prvu objavu Android aplikacije `rs.kockolov.app` (nalog Milan Djordjevic, lični).
Tekstovi za prodavnicu su ispod i spremni su za kopiranje. Slike su u [`google-play/`](google-play/).

**Redosled:** ključ → GitHub secrets → build → aplikacija u Play Console-u → zatvoreni test (12 testera × 14 dana)
→ zahtev za objavu (Google ga pregleda oko 7 dana) → produkcija.

> Lični nalog napravljen posle 13. 11. 2023: produkcija se otključava tek posle zatvorenog testa sa najmanje
> **12 testera koji su prijavljeni 14 dana zaredom**. Ko se odjavi pa ponovo prijavi, počinje od nule.

---

## 1. Ključ za potpisivanje (jednom)

To je *upload* ključ. Pravi ključ aplikacije čuva Google (Play App Signing), pa se izgubljen upload ključ
može zameniti preko Google podrške. Ipak ga sačuvaj: fajl i lozinku u menadžer lozinki.

Na serveru (Java nije potrebna, keytool radi u Dockeru):

```bash
mkdir -p /root/kockolov-android && cd /root/kockolov-android
docker run --rm -it --security-opt seccomp=unconfined -v "$PWD":/k eclipse-temurin:21-jdk \
  keytool -genkeypair -keystore /k/kockolov-upload.jks -alias upload \
  -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Milan Djordjevic, O=Kockolov, L=Nis, C=RS"
base64 -w0 kockolov-upload.jks > kockolov-upload.b64
chmod 600 kockolov-upload.*
```

keytool dva puta traži lozinku. Izaberi jaku, bez znakova `$ # ' "` i razmaka. Ista lozinka važi i za ključ.

Kopiju `.jks` fajla prebaci i na svoj računar (`scp root@159.69.146.251:/root/kockolov-android/kockolov-upload.jks .`).

<details><summary>Ili na Windows-u, ako imaš Android Studio</summary>

```powershell
& "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" -genkeypair -keystore kockolov-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Milan Djordjevic, O=Kockolov, L=Nis, C=RS"
[Convert]::ToBase64String([IO.File]::ReadAllBytes("kockolov-upload.jks")) | Set-Clipboard
```
</details>

## 2. GitHub secrets

GitHub → repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Ime | Vrednost |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | ključ kao tekst (base64), vidi ispod |
| `ANDROID_KEYSTORE_PASSWORD` | lozinka iz koraka 1 |
| `ANDROID_KEY_ALIAS` | `upload` |

(`GOOGLE_SERVICES_JSON` je već tu.) Ključ i lozinke se nigde drugde ne upisuju i ne šalju.

**Tekst za `ANDROID_KEYSTORE_BASE64`**, najlakše na Windows-u (kad je `.jks` u `C:\kockolov`), u PowerShell-u:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\kockolov\kockolov-upload.jks")) | Set-Clipboard
```

Ništa se ne ispiše, tekst je u clipboard-u: u polje **Secret** samo Ctrl+V. Ili na serveru
`base64 -w0 /root/kockolov-android/kockolov-upload.jks` i kopiraj ceo ispisani red (prelomi reda ne smetaju).

## 3. Verzija za Google Play

GitHub → **Actions → Mobile apps → Run workflow** (grana `main`) → štikliraj **Verzija za Google Play** → **Run workflow**.
Za ~10 minuta: **Releases → Kockolov za Google Play → `kockolov-1.0.0-NNN.aab`**.

Svaki build ima veći `versionCode` (Play ne prima isti broj dva puta). Za sledeću verziju promeni `version`
u `mobile/package.json` (npr. `1.0.1`) i ponovo pokreni workflow.

## 4. Aplikacija u Play Console-u

**Create app**: ime iz tačke 4a, default language **Serbian (sr)**, **App**, **Free**, potvrdi izjave.
Zatim Dashboard → **Set up your app**, redom:

| Stavka | Odgovor |
|---|---|
| Privacy policy | `https://kockolov.rs/privatnost` |
| App access | *All or some functionality is restricted* → nalog za pregled (4c) |
| Ads | No, my app does not contain ads |
| Content rating | upitnik (4d) |
| Target audience | **18 and over** (prodavnica za kupce; ne ulazimo u pravila za decu) |
| News app | No |
| Data safety | 4e |
| Government apps | No |
| Financial features | My app doesn't provide any financial features |
| Health | My app does not have any health features |
| Advertising ID | No (aplikacija ga ne koristi; u manifestu nema `AD_ID`) |
| App category | **Shopping** |
| Contact details | e-mail `kontakt@kockolov.rs`, website `https://kockolov.rs` |
| Store listing | 4a i slike iz `google-play/` |

### 4a. Store listing

**App name** (30 znakova):

```
Kockolov: uporedi cene kockica
```

(Ili samo `Kockolov`. „LEGO” u imenu aplikacije izbegavamo: Google tuđe zaštićene znakove u imenu češće
odbija nego u opisu.)

**Short description** (80):

```
Uporedi cene LEGO® setova u Srbiji i saznaj čim set koji pratiš pojeftini.
```

**Full description**:

```
Kockolov upoređuje cene LEGO® setova u prodavnicama u Srbiji: LEGO® Store, Kockarium, Ananas i još desetak drugih. Ukucaj naziv ili broj seta, ili skeniraj bar-kod sa kutije, i odmah vidiš gde je set najjeftiniji i koliko štediš.

ŠTA DOBIJAŠ
• Sve ponude za isti set na jednom mestu, od najjeftinije
• Uštedu u odnosu na LEGO® Store i najnižu cenu koju smo zabeležili
• Istoriju cene za svaki set
• Ponude dana: svakog jutra najveći popusti, po redu
• Skener bar-koda: u radnji skeniraj kutiju i proveri da li je cena dobra
• Praćenje setova: obaveštenje na telefonu čim set pojeftini ili se vrati na stanje
• Jutarnji e-mail sa najboljim ponudama, ako ga želiš

KAKO RADI
Cene proveravamo svakog jutra, direktno na sajtovima prodavnica. Kupuješ u prodavnici koju izabereš: Kockolov ništa ne prodaje i ništa ne naplaćuje.

Pretraga i ponude rade bez naloga. Uz besplatan nalog vidiš cene iz svih prodavnica, pratiš setove i dobijaš obaveštenja. Bez reklama i bez praćenja korisnika.

LEGO® je zaštićeni znak LEGO grupe, koja ne sponzoriše, ne odobrava niti je povezana sa ovom aplikacijom.
```

**Graphics** (`google-play/`): `icon-512.png`, `feature-graphic-1024x500.png`, telefon: `screenshot-1…5` (1080×1920).

**Release notes** (Šta je novo, 1.0.0):

```
Prva verzija Kockolova za Android: poređenje cena, ponude dana, skener bar-koda i obaveštenja kad set pojeftini.
```

### 4b. Zemlje

Production / Closed testing → **Countries/regions**: **Serbia** (ostale možeš dodati kasnije).

### 4c. Nalog za Google-ov pregled

Na serveru (lozinku ispisuje komanda; upiši je samo u Play Console):

```bash
cd /opt/kockolov
docker compose exec app node server/dist/cli.js user:create --email google-pregled@kockolov.rs --name "Google pregled"
```

Zatim se jednom prijavi tim nalogom i u **Nalog** isključi jutarnji e-mail i novosti (ta adresa nema sanduče).

App access → **Add instructions**: Username = ta adresa, Password = ispisana lozinka, i uputstvo:

```
Search, set pages and daily deals work without an account. Signing in unlocks prices from all shops, the watchlist and price-drop notifications. Sign in: tap "Prijava" at the top right and enter the e-mail and password above. The barcode scanner (icon next to "Blog") reads the barcode on a LEGO box.
```

### 4d. Content rating (IARC upitnik)

Kategorija: **All other app types** (utility / shopping). Na sva pitanja o nasilju, strahu, seksualnosti, igrama
na sreću, psovkama, drogama i grubom humoru: **No**. Korisnici ne komuniciraju međusobno: **No**. Deli lokaciju:
**No**. Kupovina digitalnih sadržaja: **No**. Očekivani rezultat: PEGI 3 / Everyone.

### 4e. Data safety

| Pitanje | Odgovor |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data encrypted in transit? | **Yes** (samo HTTPS) |
| Which account creation methods? | **Username and password** (e-mail + lozinka) |
| Delete account URL | `https://kockolov.rs/brisanje-naloga` |
| Can users request that some data be deleted without deleting the account? | **Yes** (setovi iz Praćenja, obaveštenja, e-mailovi) |

Tipovi podataka (sve: **Collected**, **not shared**, **optional** – korisnik bira, *not processed ephemerally*):

| Tip | Svrha |
|---|---|
| Personal info → **Email address** | App functionality, Account management, Developer communications |
| Personal info → **Name** | App functionality, Account management |
| App activity → **Other user-generated content** (setovi koje korisnik prati) | App functionality |
| Device or other IDs → **Device or other IDs** (Firebase token za obaveštenja) | App functionality |

Ne prikupljamo: lokaciju, kontakte, fotografije (skener obrađuje sliku na telefonu, serveru ide samo pročitani
broj), istoriju pretrage, analitiku, reklamni ID. Firebase Cloud Messaging je obrađivač koji radi za nas, pa se
po Google-ovim pravilima to ne računa kao „sharing”.

## 5. Zatvoreni test

1. **Testing → Closed testing → Create track** (ili postojeći „Alpha”) → **Testers**: napravi e-mail listu
   „Kockolov testeri” sa najmanje **12 Gmail adresa** (nalog kojim su prijavljeni na Android telefonu; uzmi 15–16 za
   svaki slučaj). Feedback URL/e-mail: `kontakt@kockolov.rs`.
2. **Create new release** → upload `.aab` iz koraka 3 → release notes (4a) → **Next → Save → Send for review**.
   Prvi put Google pregleda izdanje (od nekoliko sati do par dana).
3. Kad je odobreno: Testers → **Copy link** i pošalji ga testerima (poruke ispod). Svako mora da otvori link,
   dodirne **Become a tester** i instalira Kockolov iz Play prodavnice.
4. Brojač od 14 dana kreće za svakog testera od trenutka kad se prijavi. Neka ga ne brišu i neka ga povremeno
   otvore. Google gleda i da li se aplikacija stvarno koristi.

**Poruka testerima (Viber / WhatsApp):**

```
Ćao! Pravim aplikaciju Kockolov, za poređenje cena LEGO setova po prodavnicama u Srbiji. Pre objave Google traži da je 12 ljudi testira 14 dana. Da li bi mi pomogao/la? Treba mi samo Gmail adresa koju koristiš na Android telefonu, pa ti šaljem link. Hvala!
```

Kad stigne link:

```
Evo linka: <LINK>
Otvori ga na telefonu, dodirni „Become a tester”, pa instaliraj Kockolov iz Play prodavnice. Samo je nemoj brisati bar 14 dana i otvori je s vremena na vreme. Ako nešto ne radi kako treba, javi mi, baš mi to treba.
```

## 6. Zahtev za objavu

Posle 14 dana sa 12+ testera: Dashboard → **Apply for production**. Nacrt odgovora (engleski):

- **How did you recruit testers?** Friends, colleagues and members of a Serbian LEGO fan group who buy sets themselves.
- **How easy was it to recruit testers?** / **Describe the engagement**: Testers used search, set pages and the
  barcode scanner in shops, followed sets and received price-drop notifications.
- **Summarize the feedback**: (upiši ono što testeri stvarno jave, i šta je promenjeno)
- **Intended audience**: Adults in Serbia who buy LEGO sets and want the best price across local shops.
- **Value**: Compares prices of the same set across 10+ Serbian shops every morning, shows price history and deals,
  and notifies users when a followed set drops in price.
- **Expected installs in the first year**: 1,000–10,000.
- **What changed after testing / why ready**: (popuni posle testa)

Odgovor stiže za oko 7 dana. Zatim **Production → Create new release** sa poslednjim `.aab`.

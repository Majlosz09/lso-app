# LSO App — App Store i formularze Google Play (1.1.0, pierwsze wydanie w sklepach)

Opis, krótki opis i grafiki do Google Play: `docs/play-store-materials.md`.
Konta: Apple i Google — indywidualne konta Miłosza (te same co DA Emaus).
Bundle / package: `pl.lsoapp.app`. Build zawsze z gałęzi `master` (= wersja na app.lsoapp.com).

## Adresy

| Pole | Adres |
|---|---|
| Polityka prywatności | https://lsoapp.com/privacy |
| Regulamin | https://lsoapp.com/regulamin |
| Usuwanie konta | https://lsoapp.com/usun-konto |
| Support / Marketing URL | https://lsoapp.com |
| E-mail | lsoapp@parafia-borzapilski.pl |

---

## App Store Connect

**Name** (max 30): `LSO App` (jeśli zajęta: `LSO App – ministranci`)

**Subtitle** (max 30, tu 27):
```
Grafik i obecność ministrantów
```

**Promotional Text** (max 170):
```
Grafik służb, potwierdzanie obecności kodem QR lub GPS, punkty i ranking, ogłoszenia i czat — wszystko, czego potrzebuje Liturgiczna Służba Ołtarza w parafii.
```

**Keywords** (max 100 bajtów, bez spacji po przecinkach):
```
ministranci,LSO,liturgia,parafia,msza,grafik,służba,ołtarz,obecność,kościół,lektor
```

**Description**: pełny opis z `docs/play-store-materials.md` (ten sam tekst, bez emoji na początku sekcji, jeśli wolisz prościej).

**Copyright**: `2026 Miłosz Jakubczak`

**Category**: Primary **Lifestyle**, Secondary **Productivity**.

**Age rating** (kwestionariusz): wszystko None/No, poza:
- User-Generated Content → **Yes** (czat, ogłoszenia)
- Messaging and Chat → **Yes**
- Unrestricted Web Access → No, Gambling/Contests → No

**App Privacy** — „collect data?” → Yes; dla każdego: App Functionality, Linked to user: Yes, Tracking: No.

| Kategoria | Typ | Skąd |
|---|---|---|
| Contact Info | Name, Email Address, Phone Number | rejestracja / profil |
| Location | Precise Location | weryfikacja obecności GPS (tylko w chwili potwierdzania) |
| User Content | Other User Content | wiadomości czatu, usprawiedliwienia |
| User Content | Photos or Videos | tylko jeśli profil ma zdjęcie — jeśli nie, pomiń |
| Identifiers | User ID, Device ID | konto, token push |
| Other Data | Other Data Types | rocznik, obecności, punkty |

**DSA trader status**: „I'm not a trader”.
**Export compliance**: dodaj `"infoPlist": { "ITSAppUsesNonExemptEncryption": false }` w `app.json` → pytanie nie wyskoczy (bez tego odpowiadasz ręcznie: „None of the algorithms mentioned above”).

**App Review Notes** (EN):
```
LSO App is an organizer for altar server groups in Catholic parishes in Poland: mass duty schedules, attendance check-in (QR code or GPS at the church), points and a parish group chat.

Each parish is a closed group. New members join with an invitation code from the parish admin, and their account must be approved by the admin. Please use the demo accounts below (already approved, in a test parish with sample data).

Location and camera are used only in the foreground when a member confirms attendance (GPS near the church or scanning the QR code shown by the admin).

Chat safety: long-press any message → "Zgłoś administratorowi" (report) or "Zablokuj autora" (block user). Blocking hides all messages from that user immediately (enforced server-side) and disables private messages between the two users; the block list with "Odblokuj" is in Profile → "Zablokowane osoby". The parish admin reviews reports, deletes messages and can remove members. Minors under 16 register only with a parent's consent (Terms: https://lsoapp.com/regulamin).

Account deletion: Profile tab → "Usuń konto" at the bottom → type USUŃ → confirm. Deletion is immediate.

The app is in Polish only.
```
Konta demo: `@lso.test` na PROD (ministrant + opiekun) — hasła poza repo (repo jest publiczne).

**Screenshoty**: iPhone 6.5" (1284×2778), 3–10 szt., tylko parafia testowa.

---

## Google Play — App content

| Formularz | Odpowiedź |
|---|---|
| Privacy policy | https://lsoapp.com/privacy |
| Delete account URL | https://lsoapp.com/usun-konto; „można usunąć część danych bez usuwania konta?” → No |
| App access | Restricted → konta demo + instrukcja jak wyżej |
| Ads | No |
| Content rating | IARC: użytkownicy mogą się komunikować → **Yes**; udostępnianie lokalizacji innym → No (lokalizacja tylko do weryfikacji, nie jest pokazywana innym); zakupy → No |
| Target audience | **do decyzji** — zalecane 13–15, 16–17, 18+ (bez grup <13, inaczej program Families z dodatkowymi wymaganiami). Wtedy w regulaminie/rejestracji trzeba pilnować tego samego progu. |
| Financial / Health / News / Government | No |

### Data safety

Zbierane: Yes · szyfrowane w transmisji: Yes · usuwanie: Yes (URL wyżej) · udostępniane stronom trzecim: No.

| Typ | Cel | Opcjonalne? |
|---|---|---|
| Location → Approximate + Precise | App functionality | Optional (tylko metoda GPS) |
| Personal info → Name, Email, Phone number | App functionality, Account management | Required |
| Personal info → Other info (rocznik) | App functionality | Required |
| Messages → Other in-app messages (czat) | App functionality | Optional |
| App activity → Other actions (obecności, punkty) | App functionality | Required |
| Device or other IDs (token push) | App functionality | Optional |

Zdjęcia z aparatu **nie** są zbierane (aparat tylko skanuje QR).

### Uprawnienia (Play Console może zapytać)
- CAMERA — skanowanie kodu QR przy potwierdzaniu obecności.
- ACCESS_FINE/COARSE_LOCATION — tylko na pierwszym planie, sprawdzenie, czy ministrant jest przy kościele.
- RECEIVE_BOOT_COMPLETED, VIBRATE — powiadomienia.

### Test zamknięty (nowe konto osobiste)
12 testerów × 14 dni ciągłego testu przed dostępem do produkcji. Ścieżka **Closed testing** → lista testerów (e-maile Google lub Google Group) → link do dołączenia wysłać testerom (pilot 3.10).

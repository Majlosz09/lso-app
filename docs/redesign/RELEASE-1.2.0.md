# Wydanie LSO App 1.2.0 — instrukcja krok po kroku

**Gałąź wydania: `release/1.2.0`** = redesign v2 + Expo SDK 57 + 7 zmian z `master` (blokowanie w czacie,
Firebase/FCM, ikona iOS, numery buildów, teksty sklepów). Testy: jednostkowe 208/208, wszystkie testy dymne
na LSO-dev (27 zestawów) przechodzą.

Kolejność: **baza → web → aplikacje w sklepach → master**. Wszystkie polecenia uruchamiasz w Git Bash
w katalogu `lso-app`, na gałęzi `release/1.2.0` (`git checkout release/1.2.0`).

---

## Krok 1. GitHub (kopia gałęzi)
```bash
git push -u origin release/1.2.0
```

## Krok 2. Baza produkcyjna (Supabase, projekt LSO)
1. **Kopia zapasowa**: Supabase → projekt LSO → Database → Backups (sprawdź, że jest świeża kopia z dziś).
2. **Rozszerzenie pg_cron**: Database → Extensions → wyszukaj `pg_cron` → Enable (jeśli nie jest włączone).
3. Sprawdzenie, czego brakuje (nic nie zmienia):
   ```bash
   bash scripts/release-prod-sql.sh check
   ```
   Wpisz `PRODUKCJA`. Spodziewane: stare migracje `[jest]`, nowe (od `20260930000100`) `[BRAKUJE]`.
   Jeśli jakaś wrześniowa migracja (2026-09-27…09-30) też ma `[BRAKUJE]` — skrypt doda ją w kroku 4 (są w repo).
4. Migracje (tylko brakujące, po kolei, stop na pierwszym błędzie, log w `release-1.2.0-prod.log`):
   ```bash
   bash scripts/release-prod-sql.sh migrate
   ```
   Przy błędzie: nic dalej się nie wykona — wyślij mi koniec `release-1.2.0-prod.log`. Ponowne uruchomienie pomija to, co już jest.
5. Kontrola:
   ```bash
   bash scripts/release-prod-sql.sh verify
   ```
   Oczekiwane: „wszystkie 37 migracji są w bazie”, zadanie `lso-monthly-report`, `kosciol_glowny_brak = 0`.
   (Tryb `verify` nie był uruchamiany na kopii testowej — gdyby się wyłożył, wystarczy ponownie `check`: wszystko `[jest]`.)
6. Skrypt sam przełącza Supabase CLI z powrotem na LSO-dev.
7. **Szybki test na obecnej aplikacji ze sklepu (1.1.0)** — ona dalej działa na nowej bazie, dopóki ludzie nie zaktualizują:
   konto `@lso.test` → logowanie, grafik, zapis na Mszę, potwierdzenie obecności.

## Krok 3. Web — app.lsoapp.com
```bash
npm run export:web
```
Cloudflare → Workers & Pages → projekt **app.lsoapp.com** → Create deployment → wgraj zawartość `dist/`.
Sprawdź na https://app.lsoapp.com: brak znacznika „DEV”, logowanie, okno „Co nowego?”, Rozkład Mszy u opiekuna.

## Krok 4. Aplikacje mobilne (nowe buildy — wersja 1.2.0, SDK 57)
OTA (`update:production`) **nie** wchodzi w grę: nowy kod natywny, użytkownicy muszą pobrać aktualizację ze sklepu.
```bash
npx eas build --profile production --platform android
npx eas build --profile production --platform ios      # wymaga logowania do Apple (interaktywnie)
```
- `autoIncrement` podbije `versionCode`/`buildNumber` w `app.json` — po buildzie zrób commit tej zmiany.
- **Przed wysłaniem do recenzji zainstaluj build na telefonie** (Google Play: test wewnętrzny, iOS: TestFlight) i sprawdź:
  aparat + kod QR, GPS, powiadomienie push (np. przyznanie punktów), klawiatura w formularzach, odstęp od górnej krawędzi.
- Wysyłka: `npx eas submit --profile production --platform android` / `--platform ios` (albo ręcznie w konsolach).
- Tekst „Co nowego” do sklepów — niżej.

## Krok 5. Zamknięcie
```bash
git checkout master
git merge --no-ff release/1.2.0
git push origin master
```
Potem daj znać — zaktualizuję notatki i wrócimy do pracy na `master`.

---

## Co się zmienia dla użytkowników
- Dotychczasowi użytkownicy przy pierwszym wejściu widzą „Co nowego?” (treść wg roli) z przyciskiem
  „Pokaż mi, co gdzie jest” → przewodnik po ekranach. Nowi użytkownicy od razu dostają przewodnik.
- Rangi systemowe: parafie, które już je nadały, mają je włączone; pozostałe — wyłączone (ksiądz włącza w Ustawieniach → Rangi).
- Wiedza bez oznaczania „przeczytane”; wymaganie „przeczytane działy Wiedzy” w ścieżce formacji usunięte.
- Następne wydanie z nowościami: zmienić `RELEASE_ID` i treść w `lib/releaseNotes.ts`.

## Tekst „Co nowego” do sklepów (App Store / Google Play)
> Nowa wersja LSO App: odświeżony wygląd z kolorami szat liturgicznych i trybem ciemnym. Rozkład Mszy z okresami (październik z różańcem, Adwent z roratami) — daty liczą się same co roku. Obecność bez zapisu i zgłaszanie obecności po fakcie, potwierdzanie także bez internetu. Kilka kościołów i kaplic, automatyczne układanie grafiku, wydruk z kodem QR i grafik dla rodziców. Import ministrantów, tryb zakrystii na tablecie, funkcje liturgiczne, ścieżka formacji, wyzwania sezonowe i własne kategorie punktowania. Przewodnik po aplikacji pokaże, gdzie co jest.

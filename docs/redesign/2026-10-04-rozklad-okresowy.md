# Zmiany okresowe rozkładu + tryby służby + obecność bez zapisu (2026-10-04)

Gałąź `redesign/v2`, tylko LSO-dev / lso-app-dev. Web + mobile.

## Decyzje (z użytkownikiem)

- **Tryb służby** (`service_mode`) na każdej pozycji rozkładu i na każdej służbie (`schedules`):
  `signup` (zapisy + obecność + punkty) · `assigned` (obsadę ustala opiekun; obecność + punkty) · `none` (bez zapisów, obecności i punktów).
  Niedziela = przełącznik trybu całego dnia (+ pytanie w onboardingu). Migracja: istniejące niedziele → `assigned` (dotychczasowe zachowanie),
  istniejące nabożeństwa/zbiórki → `assigned`.
- **Okresy** (`mass_periods` + `mass_period_entries`, OSOBNE tabele — wersja 1.1 czyta `mass_templates` bezpośrednio):
  nazwa, od–do, `repeat_yearly`, `days_of_week`; na objęte dni ich pozycje ZASTĘPUJĄ stały rozkład. Pusty okres = odwołanie.
  Nakładanie: krótszy okres wygrywa, przy równej długości nowszy. Pozycja okresu pamięta `base_template_id` → stałe zapisy idą za nią.
- Pozycje rozkładu mają `category` (`msza` | `nabozenstwo`) — różaniec może być w rozkładzie.
- Edytor (stały rozkład i okres — ten sam komponent, szkic + „Zapisz”): przesuń godziny ±min na wybranych dniach, usuń wszystko z dni,
  tryb dla całego dnia, kopiuj dzień. Logika: `lib/massSchedule.ts` (+ testy).
- Zapis zmian rozkładu: jedno RPC z `dry_run` → podgląd skutków (zapisy na znikające godziny). Domyślnie **przenieś na odpowiadającą /
  najbliższą godzinę i powiadom**; alternatywy: odwołaj z powiadomieniem / zostaw. Puste zmaterializowane służby na znikających godzinach — usuń;
  służby z obecnością — zostają. Tryb `none` na służbie z zapisami → zapisy odwołane z powiadomieniem.
- Usunięcie obejścia 17:00/17:30 (miesiące 5, 6, 10) z `sign_up_for_slot`; stały zapis mapowany przez `origin_id`.
  **Rollout na prod:** utworzyć dla parafii użytkownika okresy maj/czerwiec/październik zanim obejście zniknie.
- `sign_up_for_slot` waliduje pozycję z obowiązującego rozkładu i tryb `signup`. Nowe `materialize_slot(date, time)` — tworzy służbę
  bez przydziału (meldowanie bez zapisu → punkty „Msza (dodatkowa)” / „Nabożeństwo”, jak już liczy `check_in_and_award_points_impl`).
  Dziś `doCheckIn` na wolnym miejscu najpierw się ZAPISUJE → liczy się jak dyżur — do poprawy.
- `check_in_and_award_points` (wrapper): odmowa dla `service_mode = 'none'`.
- **Obecność bez zapisu:** ekran Obecność = lista „Na czym jesteś?” (wszystkie służby z otwartym oknem, moje pierwsze).
  **Zgłoszenie po fakcie** do 48 h po rozpoczęciu (`attendance_reports`, status pending/approved/rejected) → kolejka opiekuna
  (obok usprawiedliwień), punkty dopiero po akceptacji (`decide_attendance_report` woła impl). Powiadomienia: `add_notification_with_parent`,
  `add_notification_admins`.
- `serviceRules`: reguła „niedziela = brak akcji” zastąpiona trybem służby; wypisać się można tylko w trybie `signup`.

## Etapy

A1 migracja (tabele, `mass_slots` SQL, `save_rozklad_change`, sign_up/materialize/wrapper) · A2 `useServices` + `serviceRules` na nowym
wyliczaniu · A3 ekran rozkładu (zakładki Stały / Zmiany okresowe, edytor, kreator okresu) + tryb w schedule-form/detail + onboarding ·
A4 podgląd skutków · B1 ekran Obecność · B2 zgłoszenia po fakcie + kolejka opiekuna · C seed demo (październik z różańcem), smoke, deploy dev.

## Stan (2026-10-04)

Etapy A1–C zrobione, na LSO-dev i https://lso-app-dev.pages.dev.
Migracje: `20261004000000_rozklad_okresowy.sql`, `20261004010000_attendance_reports.sql`.
Smoke: `node scripts/rozklad-smoke-dev.mjs` (17 OK), `node scripts/attendance-reports-smoke-dev.mjs` (12 OK).
Demo: `node scripts/rozklad-demo-dev.mjs` — „Październik — różaniec” w parafii demo.

## Przed wdrożeniem na produkcję

1. Migracje w kolejności jak wyżej (po wszystkich z redesignu).
2. Parafia, która korzystała z obejścia 17:00/17:30 (maj, czerwiec, październik): od razu po migracji dodać
   zmiany okresowe na te miesiące (co roku), inaczej stałe zapisy przestaną się przesuwać.
3. Aplikacja 1.1 (sklepy) czyta `mass_templates` bez kategorii i trybu — nabożeństwo dodane do STAŁEGO rozkładu
   pokaże jako „Msza”; okresów nie widzi (pokazuje stały rozkład). Zapis w 1.1 na służbę „Grafik” / „Bez punktów”
   zostanie odrzucony przez `sign_up_for_slot` z czytelnym komunikatem.
4. Istniejące niedziele dostają tryb „Grafik” (jak dotąd: obsada od opiekuna) — teraz ministrant może się na nich
   zameldować bez zapisu (Msza dodatkowa). Parafia, która nie chce punktów w niedziele, ustawia „Bez punktów”.

## Rok liturgiczny w rozkładzie (2026-10-05)

Migracja `20261005000000_rozklad_liturgiczny.sql`: baza liczy Wielkanoc i święta na każdy rok (`easter_date`,
`liturgical_anchor`, `liturgical_anchors`), zmiany okresowe mają rodzaj `dates` / `season` / `feasts` i opcję
„jak w niedzielę” (`copy_dow`). Smoke: `node scripts/rozklad-liturgia-smoke-dev.mjs` (daty z bazy = kalendarz
aplikacji 2026–2060). Przy wdrożeniu na produkcję: istniejącym parafiom zaproponować (albo dodać) okres
„Uroczystości nakazane (porządek niedzielny)” — nowe parafie dostają go w kreatorze.

## Kilka kościołów w parafii (2026-10-05)

Migracje `20261005010000_churches.sql`, `20261005020000_period_churches.sql`. Tabela `churches` (główny = GPS parafii,
synchronizowany w obie strony dla aplikacji 1.1), `church_id` na rozkładzie, okresach, służbach, zgłoszeniach.
Służba = data + godzina + rodzaj + kościół. Zmiana okresowa dotyczy kościołów, które ma w godzinach (albo `church_ids`);
bez godzin / „jak w niedzielę” — wszystkich. Smoke: `node scripts/churches-smoke-dev.mjs` (14 OK).
Produkcja: migracja tworzy kościół główny każdej parafii z jej GPS; aplikacja 1.1 działa jak dotąd (wszystko = kościół główny).

## Dzieci bez telefonu (2026-10-05)

Migracja `20261005030000_kids_without_phones.sql`: `sign_up_for_slot` / `report_attendance` z `p_for_child`
(tylko dziecko połączone z kontem rodzica), `unsign_child`, metoda obecności `kiosk`.
Ekrany: rodzic — karta „Dziecko bez telefonu?” w Dyżurach dzieci (zapis raz / co tydzień, wypis, zgłoszenie obecności);
opiekun — Ustawienia parafii → Tryb zakrystii (tablet, wyjście hasłem opiekuna). Smoke: `node scripts/kids-smoke-dev.mjs` (10 OK).

## Ułóż grafik za mnie (2026-10-05)

`lib/autoSchedule.ts` (+ testy) liczy propozycję w aplikacji; migracja `20261005040000_auto_schedule.sql`:
`apply_auto_schedule` (jedno zbiorcze powiadomienie `assignment_batch` na osobę), push „Nowy dyżur” tylko gdy
przydziela ktoś inny (wcześniej stały zapis „co tydzień” wysyłał push za każdy tydzień). Smoke: `node scripts/auto-schedule-smoke-dev.mjs`.

## Funkcje liturgiczne i pomocnik opiekuna (2026-10-05)

`20261005050000_liturgical_functions.sql`: `parish_functions` (domyślny zestaw), `member_functions`; rola na Mszy
nazwana jak funkcja wymaga funkcji przy samodzielnym wyborze. `20261005060000_helper_role.sql`: `profiles.is_helper`,
`can_manage_services()` podmienione w 11 regułach RLS i 10 funkcjach (blok DO na bieżących definicjach — przy wdrożeniu
uruchomić PO wszystkich wcześniejszych migracjach). Smoke: `roles-smoke-dev` (12), `helper-smoke-dev` (13), `security-smoke-dev` (32).
Demo: filip@lso-demo.test jest pomocnikiem.

## Wydruk, link dla rodziców, kalendarz w telefonie (2026-10-05)

`20261005070000_public_schedule_calendar.sql`: `parishes.public_token` + `public_schedule()` (anon, imię + inicjał),
`profiles.calendar_token` + `calendar_feed(token)` zwracające `text/calendar` (domena `"*/*"` — PostgREST oddaje plik przy
każdym Accept; zawijanie linii RFC 5545). Link do kalendarza: `<SUPABASE_URL>/rest/v1/rpc/calendar_feed?token=…&apikey=<anon>`.
Strona `/g/[token]` (bez logowania), wydruk `lib/printSchedule.ts`. Na produkcji: `EXPO_PUBLIC_WEB_URL` domyślnie app.lsoapp.com
(strona /g musi być wdrożona w webie produkcyjnym razem z resztą). Smoke: `public-calendar-smoke-dev` (13 OK).

## Ministrant bez konta + import + kod osobisty (2026-10-05)

`20261005080000_managed_members.sql`: `profiles.managed`, `claim_code`; **FK profiles.id → auth.users zdjęty**
(profil kasuje wyzwalacz `on_auth_user_deleted`). Wyzwalacze czatu / powiadomień pomijają profile bez konta,
operacje systemowe ustawiają `lso.sys` (obejście ochrony pól profilu i przydziałów). `import_members`, `regenerate_claim_code`,
`claim_code_info` (anon), `claim_member_profile` (przenosi dane z 13 tabel). Ekran `/import-members`, kod w rejestracji.
Smoke: `import-claim-smoke-dev` (14 OK). Przy wdrożeniu: sprawdzić, że żadna funkcja produkcyjna nie zakłada istnienia konta
dla każdego profilu (np. push — profile bez konta nie mają tokenu, to OK).

## Ścieżka formacji (2026-10-05)

`20261005090000_formation_path.sql`: `rank_requirements` (per parafia i stopień), `profiles.rank_since`, wyzwalacz awansu
(powiadomienie `promotion` z push), `formation_progress(profil)` i `formation_ready()`. Działy Wiedzy zapisywane razem
z kluczami haseł (`wiedza_keys`) — liczy baza. Smoke: `formation-smoke-dev` (13 OK); demo: `npx tsx scripts/formation-demo-dev.ts`.

## Wyzwania sezonowe (2026-10-05)

`20261005100000_challenges.sql`: `challenges`, `challenge_completions`, wyzwalacz na `attendance` (INSERT/DELETE)
przelicza wyzwania, premia `points.source = 'challenge'`, `challenge_board`, `recount_challenge`. Szablony w `lib/challenges.ts`
(daty z `liturgical_anchors`). Smoke: `challenges-smoke-dev` (9 OK); demo: `npx tsx scripts/challenges-demo-dev.ts`.

## Miesięczny raport dla proboszcza (2026-10-05)

`20261005110000_monthly_report.sql`: `monthly_report(miesiąc)` (tylko opiekun), `notify_monthly_reports()` + **pg_cron
`lso-monthly-report` (`0 7 1 * *` = 9:00 PL)** — przy wdrożeniu na produkcję zadanie powstaje z migracją. Zbiórki nie liczą się
do obsady. Ekran `/monthly-report`, wydruk `lib/monthlyReport.ts`. Smoke: `monthly-report-smoke-dev` (7 OK).

## Meldowanie bez zasięgu (2026-10-05)

`20261005120000_offline_checkin.sql`: `check_in_offline(data, godzina, client_time, metoda, schedule_id?, church_id?)` —
przyjmuje obecność wysłaną później, jeśli godzina meldowania mieści się w oknie służby (−40 … +100 min), nie jest z przyszłości
(+5 min tolerancji) i minęło ≤ 48 h; `attendance.checked_at` = godzina meldowania. Klient: `lib/offlineQueue.ts` (AsyncStorage
`checkin-queue:v1`), `stores/checkinQueueStore.ts` (wysyłka przy starcie, powrocie do aplikacji, zdarzeniu `online` i co minutę),
`useServiceActions.doCheckIn` przekazuje metodę (manual/qr/gps) i przy błędzie sieci odkłada do kolejki; `useServices` pamięta
ostatni grafik (`services-cache:v1:*`) i pokazuje go bez sieci; pasek `PendingCheckinsBanner` (Obecność, Dom) z „Wyślij teraz”.
Smoke: `offline-checkin-smoke-dev` (6 OK) + test w przeglądarce (offline → online, obecność z godziną kliknięcia).

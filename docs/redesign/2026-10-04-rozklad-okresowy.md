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

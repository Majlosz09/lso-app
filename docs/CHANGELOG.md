# Zmiany

Format: każda zmiana kodu = wpis w „Nieopublikowane”. Przy wydaniu sekcja przechodzi pod numer wersji (zob. skill `dokumentacja`). Historia sprzed 2026-10-20 jest w `git log` i `docs/plans`/`docs/redesign`.

## Nieopublikowane

### Dla użytkowników
- Zapis listy obecności na zbiórce jest natychmiastowy i „wszystko albo nic” — wcześniej przy słabym zasięgu mógł zapisać się w połowie.
- „Nowa wiadomość” od razu otwiera istniejącą rozmowę z tą osobą i nie zakłada drugiej; na liście są tylko osoby zatwierdzone w parafii.
- Meldunki zapisane bez zasięgu wysyłają się szybciej po powrocie sieci (próba co 15 s zamiast co minutę).
- Aplikacja ładuje się lżej: logo to mały plik zamiast 1,7 MB ikony sklepu; telefon sprząta stare kopie grafiku z pamięci.

### Techniczne
- Migracja `20261105050000_service_attendance_rpc.sql`: RPC `set_service_attendance(schedule, present[])` — pełna lista obecnych w jednej transakcji (dopisuje przez `check_in_and_award_points`, odznaczonym usuwa obecność i ustawia `absent`); `schedule-detail.tsx` zamiast pętli 2 zapytań na osobę.
- Migracja `20261105060000_open_dm_rpc.sql`: RPC `open_dm(target)` — znajdź lub załóż DM (blokada doradcza na parę, kanał + obaj członkowie w jednej transakcji; uprawnienia jak w politykach czatu). `app/chat/new-dm.tsx` zamiast N zapytań i dwóch kroków (zostawał pusty kanał, gdy dopisanie członków się nie udało — na LSO-dev 3 takie DM).
- `lib/servicesCache.ts` (+ test): klucze grafiku offline, sprzątanie raz na uruchomienie (minione zakresy, inne konta, stare formaty).
- `stores/checkinQueueStore.ts`: ponawianie kolejki offline co 15 s, gdy coś czeka (NetInfo wymaga paczki natywnej = nowy build).
- `assets/images/logo.png` (256 px, 115 KB) w 5 miejscach zamiast `icon.png` (1024 px, 1,7 MB); ikona aplikacji w `app.json` bez zmian.
- Test dymny `scripts/phone-rpc-smoke-dev.mjs` (12 OK). Sprawdzone na lso-app-dev (web): logo, nowa rozmowa (ta sama przy ponownym otwarciu), lista obecności na zbiórce (zapis i odznaczenie).

## 2026-11-05 — SQL na produkcji (audyt Etap 5, migracja 20261105040000_rls_initplan; bez zmian w aplikacji)

### Techniczne
- Migracja `20261105040000_rls_initplan.sql` (audyt Etap 5): w politykach RLS funkcje bez argumentów (`auth.uid()`, `my_parish_id()`, `is_parish_admin()`, `can_manage_services()` …) opakowane w `( SELECT … )` — liczone raz na zapytanie, nie dla każdego wiersza (13 wywołań: `notifications_*`, `content_reads_*`, `swap_offers_select`, `schedule_role_slots_select`, `chat_messages/polls/poll_votes_insert`, `attendance_reports_select/delete`). Znaczenie polityk bez zmian; bez zmian w aplikacji. Na LSO-dev i produkcji 2026-11-05.
- `scripts/attendance-reports-smoke-dev.mjs`: sprzątanie przez `dev-sql.sh` (ministrant usuwa tylko oczekujące zgłoszenia, więc przyjęte / odrzucone blokowały kolejny przebieg testu).

## 2026-11-05 — SQL + OTA + web (wersja 1.2.0, d037e05; audyt Etap 4 + aplikacyjna część Etapu 3)

OTA grupa 16be78b4 (runtime 1.2.0, iOS + Android), web app.lsoapp.com (wdrożenie 1a5a3f95).

### Dla użytkowników
- Koniec zdublowanych Mszy w grafiku (pojawiały się, gdy dwie osoby jednocześnie otwierały tę samą służbę albo meldowały się na nią). Logowanie trochę szybsze — telefon nie układa już grafiku na rok do przodu.

### Techniczne
- Migracja `20261105030000_schedules_unique.sql` (audyt Etap 4): unikalny indeks `schedules_one_per_slot` (parafia, dzień, godzina, rodzaj, kościół; bez służb ręcznych i cykli), `_slot_schedule` / `generate_schedules_from_templates` / `create_recurring_assignments` z `ON CONFLICT DO NOTHING`, funkcja `extend_schedule_coverage()` + pg_cron `lso-extend-schedules` (codziennie 02:20 UTC). Migracja przerywa się, jeśli w grafiku są już duplikaty. Na LSO-dev i produkcji 2026-11-05; przed wgraniem na produkcji jedna zdublowana Msza z przeszłości (8.09, 18:00, jedna parafia) oznaczona jako ręczna (`manual = true`) — bez przenoszenia obecności i punktów.
- `scripts/release-prod-sql.sh`: migracje Etapu 3 i 4 w kolejności dat.
- `stores/authStore.ts`: usunięte `ensureSchedulesCoverage` (przedłużanie grafiku przy logowaniu każdego członka) — robi to cron. Stara wersja aplikacji dalej je woła, bez szkody (bez duplikatów dzięki indeksowi).
- Test dymny `scripts/schedules-unique-smoke-dev.mjs` (9 OK: 8 równoległych `materialize_slot` → jedna służba).
- `lib/checkin.ts`: usunięty martwy kod bezpośredniego zapisu obecności (`recordAttendance`, `checkInButton`, `checkInGps`, `checkInQr`).

## 2026-11-05 — SQL na produkcji (audyt Etap 3, migracja 20261105020000_checkin_window; bez zmian w działaniu aplikacji)

### Dla użytkowników
- Meldowanie „Obecny” działa od 30 minut przed do 90 minut po rozpoczęciu służby — teraz pilnuje tego też serwer (tak działał przycisk w aplikacji). Opiekun zaznacza obecność bez ograniczeń czasu, meldunki zapisane bez zasięgu nadal przechodzą po powrocie sieci.

### Techniczne
- Migracja `20261105020000_checkin_window.sql` (audyt Etap 3): `check_in_and_award_points` — okno −30/+90 min (+5 min zapasu na zegar telefonu, Europe/Warsaw) dla osoby bez uprawnień opiekuna; `check_in_offline` — własne sprawdzenia (samodzielne meldowanie w parafii, tryb służby `none`) i wprost `check_in_and_award_points_impl`; polityka `attendance_insert` bez gałęzi własnej obecności (meldowanie tylko przez RPC). Na LSO-dev i produkcji 2026-11-05.
- Test dymny `scripts/checkin-window-smoke-dev.mjs` (9 OK); `security`, `admin-tools`, `points-approval` tworzą służby o bieżącej godzinie (`scripts/_warsaw-time.mjs`) zamiast stałej.

## 2026-11-05 — SQL + OTA + web (wersja 1.2.0, a77bdb2; audyt Etap 2)

### Dla użytkowników
- Rodzic zakładający konto wskazuje swoje dzieci, ale połączenie z nimi pojawia się dopiero po zatwierdzeniu konta przez opiekuna. Opiekun widzi wskazane dzieci w karcie oczekującej osoby („dzieci (połączy po zatwierdzeniu)”).
- Naprawione „Odłącz dziecko” w profilu rodzica — wcześniej pokazywało „Odłączono”, ale dziecko zostawało połączone.

### Techniczne
- Migracja `20261105010000_parent_link_requests.sql` (audyt Etap 2): tabela `parent_link_requests` (RLS: rodzic swoje, opiekun swojej parafii; zapis tylko przez RPC), `link_parent_to_children` (opiekun — od razu; rodzic oczekujący — prośby; zatwierdzony rodzic — błąd „poproś opiekuna”), `approve_member` łączy rodzica z dziećmi z próśb, `get_pending_members` pokazuje dzieci z próśb, trigger `trg_profiles_clear_link_requests` (zmiana parafii rodzica czyści prośby), RPC `unlink_my_child`. Zgodna wstecz: stara wersja aplikacji przy rejestracji też tylko tworzy prośby. Na LSO-dev i produkcji 2026-11-05; OTA grupa 9680c025 (runtime 1.2.0, iOS + Android), web app.lsoapp.com (wdrożenie 3e31a7f3).
- `app/(tabs)/profile.tsx`: odłączanie dziecka przez `unlink_my_child` (bezpośredni update cudzego profilu blokował RLS bez błędu). Teksty w `register.tsx`, `pending.tsx`, `members.tsx`.
- Test dymny `scripts/parent-link-smoke-dev.mjs` (13 OK); `security-smoke-dev` dostosowany do nowego przepływu (33 OK).

## 2026-11-05 — SQL na produkcji (audyt Etap 1, migracja 20261105000000_audit_hardening; bez zmian w aplikacji)

### Dla użytkowników
- Po Mszy nie da się już wypisać ze służby ani zgłosić nieobecności wstecz — nieobecność zgłaszasz najpóźniej 30 minut przed służbą, później pisz do opiekuna (tak działały przyciski w aplikacji; teraz pilnuje tego też serwer).
- Rolę w parafii (ministrant ↔ rodzic) zmienia opiekun.
- Wyciszenie na czacie i usunięcie wiadomości przez opiekuna są trwałe.

### Techniczne
- Migracja `20261105000000_audit_hardening.sql` (audyt 2026-11-05, Etap 1): triggery `trg_chat_members_protect` (członek zmienia u siebie tylko `last_read_at`) i `trg_chat_messages_protect` (bez przywracania / edycji usuniętej wiadomości i zmiany kanału, nadawcy, typu, ankiety, odpowiedzi, daty); `trg_profiles_protect_sensitive_fields` blokuje samodzielną zmianę `role` po dołączeniu do parafii oraz `rank_since`, `managed`, `claim_code`, `former_parish_id`; polityka `schedule_assignments_delete` — własny przydział tylko `assigned`, w trybie `signup`, przed godziną służby; `trg_assignments_protect` — `assigned → excused` najpóźniej 30 min przed służbą; unikalny indeks `points_one_checkin_per_service` + `check_in_and_award_points_impl` przyznaje punkty tylko gdy obecność faktycznie została wstawiona (koniec podwójnych punktów przy równoległym meldowaniu); 7 indeksów kluczy obcych. Migracja przerywa się, jeśli w bazie są już zdublowane punkty za meldowanie. Na LSO-dev i produkcji 2026-11-05; przed wgraniem na produkcji usunięto 1 zdublowany wiersz punktów za meldowanie (19.10, ta sama osoba i Msza).
- Test dymny `scripts/audit-hardening-smoke-dev.mjs`. Testy `import-claim` i `monthly-report`: `dev-sql.sh` z `--yes` (CLI w trybie agenta wymaga potwierdzenia, przez co sprzątanie nie działało); `import-claim` uwzględnia wyłączone rangi systemowe.
- Plan napraw po audycie: `docs/superpowers/plans/2026-11-05-audyt-naprawy.md`.
- `scripts/release-prod-sql.sh`: kontrole idą jako `--read-only`, wgranie migracji jako `--yes`. Nowsze Supabase CLI pyta o zgodę przy każdym zapytaniu, przez co `check` pokazywał wszystkie migracje jako „BRAKUJE”; `migrate` zatrzymywał się na bezpieczniku. `check` przy pierwszej „brakującej” migracji pokazuje surową odpowiedź CLI (błąd zapytania wyglądał jak brak migracji). Właściwa przyczyna: w terminalu Windows CLI zwraca tabelę zamiast JSON — kontrole wymuszają `-o json` i akceptują też format tabeli.

## 2026-11-03 — OTA + web (wersja 1.2.0, bdf066f)

### Dla użytkowników
- Import punktów z poprzednich okresów (Punkty → „Import”): opiekun wkleja z Excela imię i nazwisko + punkty (opcjonalnie powód), aplikacja dopasowuje osoby (bez polskich znaków, też „Nazwisko Imię”), nierozpoznane można wskazać ręcznie, a wpisy dostają wybraną datę (np. ostatni dzień przed startem aplikacji).
- Rejestracja: kod parafii jest sprawdzany przed założeniem konta — zły kod można poprawić i wysłać ponownie (wcześniej powstawało konto bez parafii, a druga próba kończyła się „email już zarejestrowany”).
- Usunięcie Mszy z grafiku (np. wyjątkowo się nie odbywa) odwołuje ją w tym dniu: nie wraca już jako „wolne miejsce z rozkładu”, zapisani dostają powiadomienie. Opiekun widzi ją w grafiku jako „odwołana” i może ją przywrócić.

### Techniczne
- `lib/importPoints.ts` (+ testy) i ekran `app/(admin)/import-points.tsx`: zwykły insert do `points` (`source = manual`, `created_at` = wybrana data, 12:00), bez zmian w bazie.
- Skrypt `scripts/seed-promotor-demo.mjs`: wypełnia świeżą parafię testową przykładowymi danymi (10 ministrantów bez konta, grafik −3/+2 tyg. z obsadą, obecności z punktami, ogłoszenia). Działa jako opiekun (klucz anon, RLS), odmawia przy innych kontach w parafii, można go uruchamiać wielokrotnie. Gdy parafia nie widzi żadnych stopni, włącza `system_ranks_enabled` (jak przełącznik w „Stopniach”). Użyty 2026-10-29 dla parafii demo promotora (prod) i na LSO-dev.
- Migracja `20261026000000_mass_cancellations.sql`: tabela `mass_cancellations`, `mass_slots()` pomija odwołane pozycje, RPC `cancel_service` / `cancel_mass_slot` / `restore_mass_slot`, trigger `trg_a_schedules_uncancel` (ręczne dodanie służby w odwołanym terminie przywraca pozycję rozkładu).
- Włączono automatyczne pilnowanie dokumentacji (hook Auto-docs).
- Dokumentacja startowa: `docs/README.md`, `ARCHITEKTURA.md`, `BAZA-DANYCH.md` (inwentarz 44 tabel, polityk RLS, ~140 funkcji, triggerów i crona złożony ze schematu produkcji 2026-09-27 + migracji), `funkcje/` (6 modułów), `decyzje/` (ADR 0001–0004).

# Naprawy po audycie architektury (2026-11-05)

Źródło: audyt w 3 krokach (architektura → baza i logika → mobile vs web), 2026-11-04/05.
Każdy etap: migracja na **LSO-dev** (`scripts/dev-sql.sh`, najpierw w `BEGIN … ROLLBACK`) → test dymny `scripts/*-smoke-dev.mjs` → kod (web **i** telefon) → `docs/BAZA-DANYCH.md` + `CHANGELOG.md` → wydanie (skill `wydanie-aplikacji`: SQL prod → push → OTA → web).

Token LSO-dev odświeżony 2026-11-05. `dev-sql.sh` wymaga `--yes` przy zapisie (CLI w trybie agenta) albo `--read-only` przy odczycie.

Decyzje użytkownika (2026-11-05):
- łączenie rodzica z dzieckiem → **prośba zatwierdzana przez opiekuna** razem z zatwierdzeniem rodzica,
- kod QR → **zostaje stały** (zabezpieczeniem jest okno czasu po stronie serwera).

---

## Etap 1 — doszczelnienia w bazie (tylko SQL, aplikacja bez zmian) — ✅ LSO-dev + produkcja 2026-11-05

Migracja `20261105000000_audit_hardening.sql`, test `scripts/audit-hardening-smoke-dev.mjs` (21 OK). Regresja: swap, parent-absence, helper, import-claim, offline-checkin, chat-settings, excuse-penalty, points-approval, security, kids, attendance-reports — OK (`roles` i `recurring-guard` mają nieaktualne dane demo: Filip jest pomocnikiem, brak śr 17:00/18:00 w rozkładzie).

- [x] `chat_members_update`: użytkownik zmienia tylko `last_read_at` (trigger blokujący zmianę `channel_id`, `user_id`, `can_post`; `can_post` zmienia opiekun/RPC).
- [x] `chat_messages_update`: autor nie zdejmuje `deleted_at` (raz usunięta zostaje usunięta) i nie zmienia `channel_id`, `sender_id`, `type`, `poll_id`, `created_at`.
- [x] Profil: sam użytkownik nie zmienia `role` (member ↔ parent) ani `rank_since`, `managed`, `claim_code`, `former_parish_id` — rozszerzenie `trg_profiles_protect_sensitive_fields`. Sprawdzić, czy rejestracja / „Dołącz z kodem” nie ustawia roli po fakcie (`register.tsx`, `parish-setup.tsx`).
- [x] `schedule_assignments_delete`: ministrant usuwa własny przydział tylko gdy status `assigned`, służba w przyszłości i tryb `signup` (jak `serviceRules.canUnsign`); opiekun/pomocnik bez zmian.
- [x] Przejście `assigned → excused` tylko przed godziną służby (trigger `trg_assignments_protect`).
- [x] Punkty za meldowanie bez duplikatów: najpierw zapytanie o istniejące duplikaty (`source = 'checkin'`, ten sam `profile_id` + `schedule_id`), potem unikalny indeks częściowy i `ON CONFLICT DO NOTHING` w `check_in_and_award_points_impl` (punkty tylko gdy obecność faktycznie wstawiona — `INSERT … RETURNING`).
- [x] Indeksy kluczy obcych: `points.schedule_id`, `swap_offers.schedule_id`, `attendance_reports.schedule_id`, `chat_messages.sender_id`, `chat_messages.reply_to_id`, `challenge_completions.profile_id`, `recurring_commitments.profile_id`.
- [x] Test dymny: każda z powyższych prób jako ministrant → błąd; zwykłe ścieżki aplikacji (wypis, nieobecność, odczyt czatu, edycja wiadomości) → działają.

## Etap 2 — rodzic łączy się z dzieckiem za zgodą opiekuna — ✅ LSO-dev + prod SQL + OTA 9680c025 + web 2026-11-05

Migracja `20261105010000_parent_link_requests.sql`, test `scripts/parent-link-smoke-dev.mjs` (13 OK). Przy okazji naprawione „Odłącz dziecko” rodzica (RPC `unlink_my_child`).

- [x] Tabela `parent_link_requests (parent_id, child_id, created_at)` + RLS (rodzic widzi swoje, opiekun swojej parafii).
- [x] `link_parent_to_children`: zamiast ustawiać `parent_id` — zapisuje prośby; bezpośrednie łączenie tylko dla opiekuna.
- [x] `approve_member` (rodzic): po zatwierdzeniu łączy z dziećmi z próśb (tylko dzieci nadal bez rodzica); odrzucenie usuwa prośby.
- [x] `get_pending_members`: zwraca wskazane dzieci, żeby opiekun widział je w karcie zatwierdzania.
- [x] UI: karta oczekującego rodzica w `members.tsx` pokazuje „Wskazane dzieci: …”; ekran rodzica „czeka na zatwierdzenie” mówi, że dzieci pojawią się po zatwierdzeniu.
- [x] Istniejące połączenia zostają (bez migracji danych); opcjonalnie lista rodziców połączonych przed zatwierdzeniem do ręcznego przejrzenia.

## Etap 3 — meldowanie sprawdzane przez serwer — ✅ LSO-dev + prod SQL 2026-11-05 (zmiana w lib/checkin.ts = martwy kod, pojedzie z następnym OTA/web)

- [x] `check_in_and_award_points`: dla osoby bez uprawnień opiekuna okno **−30/+90 min** od godziny służby (strefa Europe/Warsaw), jak w `lib/serviceRules.ts`; opiekun/pomocnik bez okna (zaznacza obecność po fakcie).
- [x] `check_in_offline`: zostaje okno −40…+100 względem godziny meldowania z telefonu i ≤ 48 h, ale woła `_impl` po własnych sprawdzeniach (wrapper odrzucałby spóźnione meldunki offline).
- [x] `attendance_insert`: ministrant nie wstawia obecności bezpośrednio (tylko przez RPC) — usunąć gałąź `profile_id = auth.uid()`.
- [x] Usunąć martwy kod `recordAttendance` / `checkInGps` / `checkInQr` / `checkInButton` z `lib/checkin.ts` (zostają `validateGps`, `validateParishQr`, `buildParishQrValue`).
- [x] `docs/ARCHITEKTURA.md` → „Znane ograniczenia”: zaktualizować (zostaje: GPS i QR sprawdza telefon, QR stały — decyzja).

## Etap 4 — grafik bez duplikatów — ✅ LSO-dev + prod SQL 2026-11-05 (prod: 1 duplikat z 8.09 oznaczony manual), OTA + web: czeka

- [x] Uruchomić `tidy_schedules` w trybie próbnym na dev/prod — lista duplikatów.
- [x] Częściowy unikalny indeks `schedules (parish_id, date, time, church_id, category) WHERE NOT manual` (po scaleniu duplikatów).
- [x] `_slot_schedule` / `materialize_slot` / `generate_schedules_from_templates`: `INSERT … ON CONFLICT DO NOTHING` + ponowny odczyt id.
- [x] Generowanie grafiku na rok przenieść z telefonu (`ensureSchedulesCoverage` w `stores/authStore.ts`, odpala każdy członek przy logowaniu) do pg_cron (raz na dobę, wszystkie parafie z `setup_done`). Uwaga: **nie usuwać bez zastępstwa** — publiczny grafik, ICS, wydruk, kalendarz miesiąca i pulpit opiekuna czytają tylko z `schedules`.

## Etap 5 — wydajność RLS

- [ ] **Korekta 2026-11-05:** na żywej bazie bez `(SELECT …)` jest tylko 14 polityk (migracja `chat_perf_rodo` przepisała resztę dynamicznie; liczba 79 pochodziła z samych plików). Zostały: `attendance_insert`, `attendance_reports_select/delete`, `chat_messages_insert`, `chat_poll_votes_insert`, `chat_polls_insert`, `content_reads_*`, `notifications_*`, `schedule_role_slots_select`, `swap_offers_select` — opakować przy okazji, niski priorytet.
- [ ] Starsze polityki z podzapytaniem do `profiles` (`groups`, `member_badges`, `badge_definitions`, `wiedza_entries`, `recurring_commitments`) → funkcje pomocnicze.
- [ ] Pomiar przed/po: `EXPLAIN ANALYZE` grafiku tygodnia i listy punktów jako ministrant na LSO-dev (parafia demo).
- [ ] Świeży zrzut schematu z produkcji do `supabase/dev/` (pliki migracji ≠ baza po dynamicznej podmianie w `helper_role`).

## Etap 6 — telefon: pamięć i zapytania

- [ ] Cache grafiku: jeden klucz na osobę (ostatni odczyt dla bieżącego tygodnia ± 2 dni), przy starcie usunąć stare klucze `services-cache:v1:*`.
- [ ] `useServices` przez React Query (klucz = parafia + zakres), żeby Pulpit, Grafik i Obecność dzieliły dane; `staleTime` w `QueryClient`.
- [ ] Realtime: jedna subskrypcja na parafię (store), odświeżanie z opóźnieniem ~1–2 s zamiast przeładowania każdej kopii przy każdej zmianie.
- [ ] Zapis obecności przez opiekuna: jedno RPC z listą osób (w transakcji) zamiast pętli w `schedule-detail.tsx`.
- [ ] `new-dm.tsx`: RPC „znajdź lub utwórz DM” (koniec N zapytań i duplikatów rozmów).
- [ ] Kolejka offline na telefonie: wysyłka po odzyskaniu sieci (NetInfo albo `AppState` + próba) — dziś tylko co 60 s.
- [ ] Logo: mniejszy plik (np. 256 px) zamiast 1,7 MB ikony sklepu w 5 miejscach.

## Etap 7 — web

- [ ] Dzielenie bundla (async routes w expo-router dla weba) — dziś jeden plik 6 MB z całym panelem opiekuna.
- [ ] Do decyzji: powiadomienia dla opiekunów pracujących tylko na webie (np. e-mail o nowych zgłoszeniach / oczekujących członkach) — na webie nie ma push.

## Poza planem (niski priorytet, świadomie odłożone)

- Odznaki „auto” przyznaje telefon (`lib/badges.ts`) — ministrant może przez API wstawić sobie odznakę. Przeniesienie liczenia do bazy to większa zmiana.
- `get_parish_children_by_code` bez logowania (imię, inicjał, rocznik po kodzie parafii) — po Etapie 2 można przenieść za logowanie.
- Martwe tabele `groups`, `group_members`, `extra_attendance`; dwa systemy punktacji (`point_rules` + `point_categories`).

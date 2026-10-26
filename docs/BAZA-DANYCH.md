# Baza danych (Supabase / PostgreSQL)

Stan na 2026-10-20: schemat produkcji z 2026-09-27 (`supabase/dev/schema-from-prod.sql`) + migracje od `20260927000000` do `20261009010000`. Starsze migracje (maj–czerwiec 2026) są już zawarte w schemacie bazowym.

Zasada: **dane każdej parafii oddziela RLS**. Pomocnicze funkcje używane w politykach:

| Funkcja | Zwraca |
|---|---|
| `my_parish_id()` | parafia zalogowanej osoby |
| `is_parish_admin()` | opiekun zatwierdzony w swojej parafii (`role = 'admin'` lub `is_admin`) |
| `can_manage_services()` | opiekun **albo pomocnik** (`is_helper`) — używana tam, gdzie pomocnik może działać (grafik, obsada, obecność, zgłoszenia) |
| `i_belong_to_parish()`, `my_created_parish_count()` | ograniczenia przy zakładaniu parafii (max 5 na osobę, tylko gdy nie należy się do żadnej) |
| `is_chat_member(kanał)`, `chat_channel_parish(kanał)`, `chat_can_post(kanał)`, `dm_blocked(kanał)` | uprawnienia czatu |

Migracja `20261005060000_helper_role.sql` podmieniła dynamicznie `is_parish_admin()` → `can_manage_services()` w politykach: `schedules` (insert/update/delete), `schedule_assignments` (insert/update/delete), `attendance` (insert/update/delete), `attendance_reports_select`, `recurring_assignments_select` oraz w funkcjach `apply_auto_schedule`, `assign_role_slot`, `cancel_recurring_assignments`, `check_in_and_award_points`, `create_recurring_assignments`, `decide_attendance_report`, `reject_absence_request`, `set_schedule_roles` i triggerach przydziałów. W plikach migracji tych miejsc nadal widać `is_parish_admin()` — na bazie obowiązuje wersja po podmianie.

## Tabele

### Parafia, ludzie, role

| Tabela | Po co | Kluczowe kolumny |
|---|---|---|
| `parishes` | parafia | `name`, `city`, `invite_code` (dołączanie), `created_by`, GPS (`lat`, `lng`, `gps_radius` — synchronizowane z kościołem głównym), `attendance_methods[]` + `attendance_primary` (`qr`/`gps`/`button`/`admin`), `allow_member_dm`, `members_can_create_polls`, `parents_see_general`, `rejected_excuse_penalty`, `public_token` (publiczny grafik), `system_ranks_enabled`, `is_test` |
| `profiles` | konto (id = `auth.users.id`, ale profile „zarządzane” istnieją bez konta) | `full_name`, `role` (`member`/`parent`/`admin`), `is_admin`, `is_helper`, `approved`, `parish_id`, `former_parish_id`, `parent_id` (dziecko → rodzic), `rocznik`, `rank_id` + `rank_since`, `managed` + `claim_code` (profil założony przez opiekuna, przejmowany kodem), `calendar_token`, `push_token`, `onboarding_completed` |
| `churches` | kościoły i kaplice parafii | `is_main` (dokładnie jeden), `name`, `short_name`, GPS, `sort_order` |
| `parish_functions`, `member_functions` | funkcje liturgiczne (lektor, ceremoniarz…) i kto je ma | `seed_parish_functions` zakłada domyślne przy nowej parafii |
| `groups`, `group_members` | grupy ministrantów (starszy moduł) | |
| `user_blocks` | blokowanie użytkowników na czacie | `blocker_id`, `blocked_id` |

### Rozkład Mszy i grafik

| Tabela | Po co | Kluczowe kolumny |
|---|---|---|
| `mass_templates` | stały tydzień: dzień + godzina + rodzaj | `day_of_week`, `time`, `label`, `category` (`msza`/`nabozenstwo`/`zbiorka`), `service_mode` (`signup`/`assigned`/`none`), `church_id`, `point_category_id` |
| `mass_periods` | zmiany okresowe (np. wakacje, Adwent, święta) | `date_from`/`date_to` lub reguła liturgiczna (`rule` = `dates`/`season`/`feasts`, `season_from`/`to` + przesunięcia, `feasts[]`), `repeat_yearly`, `days_of_week[]`, `copy_dow` („jak w niedzielę”), `church_ids[]` |
| `mass_period_entries` | godziny obowiązujące w okresie | jak `mass_templates` + `period_id` |
| `schedules` | konkretna służba w danym dniu | `date`, `time`, `title`, `category`, `service_mode`, `roles_mode`, `church_id`, `point_category_id`, `series_id`, `manual` (dodana ręcznie poza rozkładem), `notes` |
| `schedule_assignments` | kto jest na służbie | `status`: `assigned` (zapisany) → `present` / `excused` (zgłosił nieobecność) → `confirmed` (usprawiedliwiony) / `absent` / `swapped`; `absence_reason`, `admin_note`, `slot_id` (rola), `recurring_assignment_id` |
| `schedule_role_slots` | role na Mszy świątecznej (np. krzyż, kadzidło) | `name`, `position`; wymagana funkcja: `role_required_function` |
| `recurring_assignments` | stały dyżur ustawiony przez opiekuna („co środę 18:00”) | `day_of_week`, `time`, `start_date`, `end_date` |
| `recurring_commitments` | stały zapis ministranta „co tydzień” | `day_of_week`, `time_slot`, `template_id` |
| `swap_offers` | prośby o zamianę dyżuru | `from_profile_id`, `to_profile_id`, `status`, `message` |

### Obecność i punkty

| Tabela | Po co | Kluczowe kolumny |
|---|---|---|
| `attendance` | potwierdzona obecność | `method` (`gps`/`qr`/`manual`/`report`/`kiosk`; przycisk „Obecny” zapisuje się jako `manual`), `checked_at`, `marked_by`; `lat`/`lng` zawsze czyszczone triggerem |
| `attendance_reports` | zgłoszenie obecności po fakcie (do 48 h), zatwierdza opiekun lub pomocnik | `service_date`, `service_time`, `status` (`pending`/`approved`/`rejected`), `admin_note`, `decided_by` |
| `extra_attendance` | dodatkowe wydarzenia (starszy moduł) | `event_type`, `event_date`, `event_time` |
| `points` | każdy przyznany / odebrany punkt | `amount`, `reason`, `source` (`checkin`/`manual`/`penalty`/`challenge`), `schedule_id`, `point_category_id`, `service_type` (enum, starszy podział) |
| `point_rules` | punkty za rodzaj służby (starszy podział) | `service_type`, `points` |
| `point_categories` | własne kategorie punktowania parafii (np. „Roraty” 8 pkt) | `points`, `for_services`, `for_manual` |
| `ranks` | stopnie (systemowe lub parafii) | `order`, `is_system`; systemowe tylko gdy `parishes.system_ranks_enabled` |
| `rank_requirements` | ścieżka formacji: wymagania do stopnia | `min_services`, `min_months`, `min_rate` (frekwencja %), `wiedza_categories[]`, `wiedza_keys[]` |
| `badge_definitions`, `member_badges` | odznaki (automatyczne i nadawane) | `type`, `persistence`, `criteria_key`; `is_active` |
| `challenges`, `challenge_completions` | wyzwania sezonowe z premią | `date_from`/`date_to`, `goal`, `bonus_points`, `title_filter`, `category` |

### Komunikacja i treści

| Tabela | Po co |
|---|---|
| `announcements` | ogłoszenia parafii (`target_audience`, `is_pinned`) |
| `app_announcements`, `app_announcement_dismissals` | komunikaty od twórcy aplikacji dla wszystkich parafii (`audience[]`, okres publikacji) |
| `chat_channels`, `chat_members`, `chat_messages` | czat: kanały parafii (tworzone automatycznie) i wiadomości prywatne (`type = 'dm'`); `chat_members.can_post` |
| `chat_polls`, `chat_poll_options`, `chat_poll_votes`, `chat_reactions` | ankiety i reakcje |
| `chat_reports` | zgłoszenia wiadomości do opiekuna |
| `notifications` | centrum powiadomień (zapisują triggery; z niego idzie push) |
| `content_reads` | przeczytane ogłoszenia i hasła Wiedzy (`kind`, `item_key`) — synchronizacja web ↔ telefon |
| `wiedza_entries` | treści Wiedzy dodane przez parafię (pozostałe są wbudowane w `lib/wiedza.ts`) |
| `daily_word` | Słowo na dziś (data → sigla, tekst, źródło), wspólne dla wszystkich; dane do 2027-10-01 |

Widok: `points_summary` (sumy punktów, `security_invoker`). Storage: kubeł `avatars`, plik `<uid>.jpg`, każdy zarządza tylko swoim.

## Kto co widzi i zmienia (RLS po ludzku)

| Obszar | Czyta | Zmienia |
|---|---|---|
| Parafia | swoją (i założoną przez siebie) | opiekun; nową zakłada osoba bez parafii (max 5) |
| Profile | siebie + zatwierdzonych z parafii (opiekun także byłych członków — imiona w historii; oczekujących pobiera przez `get_pending_members`) | siebie (bez pól chronionych) i opiekun w parafii |
| Grafik, rozkład, kościoły, funkcje | wszyscy z parafii | grafik i obsadę: opiekun + pomocnik; rozkład, kościoły, funkcje: opiekun (rozkład zapisuje `save_rozklad`) |
| Przydziały | wszyscy z parafii | własne (status, rezygnacja) + opiekun/pomocnik; zapis na służbę przez `sign_up_for_slot` |
| Obecność | wszyscy z parafii | opiekun/pomocnik; ministrant tylko swoją i tylko gdy parafia pozwala na samodzielne meldowanie |
| Punkty, rangi, kategorie, wyzwania | wszyscy z parafii | opiekun (punkty za obecność dopisuje funkcja meldowania) |
| Zgłoszenia obecności | autor, rodzic dziecka, opiekun/pomocnik | autor wycofuje oczekujące; decyduje `decide_attendance_report` |
| Ogłoszenia | parafia | opiekun |
| Czat | członkowie kanału; opiekun dodatkowo kanały parafii i zgłoszone wiadomości | autor (edycja/usunięcie), opiekun moderuje; zablokowani znikają z widoku (polityka RESTRICTIVE) |
| Powiadomienia, przeczytane, blokady | tylko własne | tylko własne |
| Słowo na dziś, komunikaty aplikacji | wszyscy zalogowani | nikt z aplikacji |

## Najważniejsze funkcje RPC

Wszystkie poniżej są `SECURITY DEFINER` (omijają RLS) i same sprawdzają uprawnienia.

**Konto i członkostwo**: `handle_new_user` (trigger po rejestracji — tworzy profil), `approve_member`, `get_pending_members`, `set_member_role`, `remove_member_from_parish`, `get_parish_members`, `get_parish_by_invite_code`, `get_parish_children_by_code` + `link_parent_to_children` (rodzic łączy się z dziećmi kodem parafii), `import_members` (lista z Excela → profile zarządzane), `claim_code_info` + `claim_member_profile` + `regenerate_claim_code` (przejęcie profilu kodem), `delete_my_account`, `export_my_data`.

**Rozkład i grafik**: `mass_slots(parafia, od, do)` (wylicza godziny z rozkładu + okresów + kalendarza liturgicznego; także w `lib/massSchedule.ts`), `save_rozklad` (zapis stałego tygodnia lub okresu z polityką `move`/`cancel`/`keep` dla istniejących służb i trybem próbnym), `generate_schedules_from_templates`, `materialize_slot`, `tidy_schedules` (porządkowanie służb spoza rozkładu i duplikatów, tryb próbny), `cancel_service` / `cancel_mass_slot` / `restore_mass_slot` (odwołanie Mszy z rozkładu w danym dniu — tabela `mass_cancellations`, którą `mass_slots` pomija), `apply_auto_schedule` („Ułóż grafik za mnie”), `create_recurring_assignments` / `preview_recurring_assignments` / `cancel_recurring_assignments`, `set_schedule_roles`, `assign_role_slot`, `claim_role_slot`, `release_role_slot`, `delete_church`, `easter_date`, `liturgical_anchors`.

**Zapisy, zamiany, nieobecności**: `sign_up_for_slot` (jednorazowo lub „co tydzień”, także za dziecko), `unsign_child`, `request_swap` / `respond_swap` / `cancel_swap`, `reject_absence_request` (odrzucenie usprawiedliwienia z karą z ustawień parafii), `report_child_absence` / `withdraw_child_absence`.

**Obecność i punkty**: `check_in_and_award_points` (sprawdza parafię, uprawnienia, tryb służby i samodzielne meldowanie, potem `..._impl` zapisuje obecność, status `present` i punkty według kategorii), `check_in_offline` (meldunek z kolejki offline, okno −40…+100 min, ≤ 48 h), `report_attendance` + `decide_attendance_report` (zgłoszenie po fakcie), `set_attendance_points` (korekta punktów za obecność), `formation_progress` / `formation_ready`, `challenge_board` / `challenge_count` / `recount_challenge`, `rank_available`.

**Raporty i udostępnianie**: `monthly_report(miesiąc)`, `notify_monthly_reports` (cron), `set_public_schedule` + `public_schedule(token, od, do)` (grafik bez logowania, dostępny dla `anon`), `my_calendar_token` + `calendar_feed(token)` (plik ICS dla kalendarza w telefonie, dostępny dla `anon`).

**Powiadomienia**: `add_notification`, `add_notification_admins`, `add_notification_with_parent`, `notify_push`, `claim_push_token`, `release_push_token`, `send_test_push`.

## Triggery (co dzieje się automatycznie)

- **Nowy użytkownik** (`auth.users`) → profil (`handle_new_user`); usunięcie konta → usunięcie profilu (`trg_auth_user_deleted`; klucz obcy `profiles.id → auth.users` celowo zdjęty, bo profile zarządzane nie mają konta). Operacje systemowe ustawiają zmienną `lso.sys`, która omija ochronę pól profilu i przydziałów.
- **Nowa parafia** → kanały czatu, kościół główny, domyślne funkcje liturgiczne.
- **Profil** → dodanie do kanałów czatu, powiadomienie opiekuna o nowym członku, ochrona pól wrażliwych, zapis daty zmiany stopnia.
- **Przydział** → powiadomienia (przydział, nieobecność, decyzja), ochrona statusu, dopasowanie roli, zdjęcie kary po zmianie statusu.
- **Obecność** → czyszczenie GPS, przeliczenie wyzwań, cofnięcie punktów po usunięciu obecności.
- **Punkty, ogłoszenia, zamiany** → wpis w `notifications`.
- **`notifications`** → push (`trg_notifications_push`); wiersz może zmienić tylko odbiorca (oznaczenie jako przeczytane).
- **Kościoły / parafia** → synchronizacja GPS między parafią a kościołem głównym; ochrona kościoła głównego.
- **Służby** → domyślny kościół, kategoria punktów, tryb służby z rozkładu.

## Zadania cykliczne (pg_cron)

| Zadanie | Kiedy | Co robi |
|---|---|---|
| `lso-monthly-report` | 1. dnia miesiąca, 07:00 UTC | powiadamia opiekunów o raporcie za poprzedni miesiąc |

## Migracje — jak wprowadzać

1. Plik `supabase/migrations/YYYYMMDDHHMMSS_opis.sql`, idempotentnie (`IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP POLICY IF EXISTS` przed `CREATE POLICY`).
2. Test na LSO-dev: `bash scripts/dev-sql.sh -f <plik>` (w `BEGIN … ROLLBACK`), test dymny `scripts/<funkcja>-smoke-dev.mjs`.
3. Produkcja: dopisz plik do listy w `scripts/release-prod-sql.sh` i uruchom go albo wklej SQL w Supabase SQL Editor — **przed** wdrożeniem kodu, który z niego korzysta. Weryfikacja przez anon API: `42501` = funkcja istnieje, `42703` = brak kolumny.
4. Zaktualizuj ten plik i `docs/CHANGELOG.md`.

Funkcje `SECURITY DEFINER`: zawsze `SET search_path = public`, `REVOKE … FROM PUBLIC, anon`, `GRANT … TO authenticated` i jawne sprawdzenie `my_parish_id()` / roli w treści.

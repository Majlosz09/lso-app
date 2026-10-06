# Wydanie LSO App 1.2.0 (redesign v2, Expo SDK 57) — lista kroków

Gałąź z kompletem zmian: `redesign/sdk57` (zawiera `redesign/v2`). Wszystko przetestowane wyłącznie na LSO-dev / lso-app-dev.

## 0. Przed startem
- [ ] Kopia zapasowa bazy PROD (Supabase → Database → Backups) tuż przed migracjami.
- [ ] Sprawdzić na telefonie z buildem SDK 57 (nie tylko Expo Go): logowanie, grafik, potwierdzanie obecności (QR/GPS), push.
- [ ] Rozszerzenie `pg_cron` włączone w projekcie PROD (raport miesięczny — migracja `20261005110000`).

## 1. Baza PROD — migracje w tej kolejności
Wszystkie są idempotentne (IF NOT EXISTS / CREATE OR REPLACE), ale uruchamiać po kolei, każdą raz:

1. `20260930000000_attendance_methods.sql`
2. `20261001000000_rejected_excuse_penalty.sql`
3. `20261001010000_parent_child_absence.sql`
4. `20261001020000_swap_requests.sql`
5. `20261001030000_chat_settings.sql`
6. `20261001040000_content_reads.sql`
7. `20261001050000_notifications_center.sql`
8. `20261001060000_daily_word.sql`
9. `20261001070000_schedule_roles.sql`
10. `20261004000000_rozklad_okresowy.sql`
11. `20261004010000_attendance_reports.sql`
12. `20261004020000_push_for_new_notifications.sql`
13. `20261005000000_rozklad_liturgiczny.sql`
14. `20261005010000_churches.sql`
15. `20261005020000_period_churches.sql`
16. `20261005030000_kids_without_phones.sql`
17. `20261005040000_auto_schedule.sql`
18. `20261005050000_liturgical_functions.sql`
19. `20261005060000_helper_role.sql`
20. `20261005070000_public_schedule_calendar.sql`
21. `20261005080000_managed_members.sql`
22. `20261005090000_formation_path.sql`
23. `20261005100000_challenges.sql`
24. `20261005110000_monthly_report.sql` (tworzy zadanie pg_cron `lso-monthly-report`)
25. `20261005120000_offline_checkin.sql`
26. `20261006000000_system_ranks_toggle.sql` (rangi systemowe zostają włączone parafiom, które ich już używają)
27. `20261006010000_point_categories.sql`
28. `20261006020000_formation_without_wiedza.sql`

Nie uruchamiać na PROD skryptów `scripts/*-dev.*` (dane demo, testy) — mają blokadę na bazę dev.

Po migracjach: smoke ręczny na koncie testowym PROD (`@lso.test`): rozkład Mszy, zapis, obecność, zgłoszenie obecności, raport miesięczny.

## 2. Aplikacje mobilne (nowe buildy — OTA nie wystarczy)
- Wersja **1.2.0** = nowy runtime (SDK 57). Aktualizacja OTA nie trafi do instalacji 1.1.0 i nie może — natywny kod jest inny.
- [ ] `eas build --profile production --platform all` → `eas submit` (App Store + Google Play).
- [ ] Do czasu aktualizacji ze sklepu użytkownicy mają 1.1.0 na nowej bazie — sprawdzić, że stara wersja działa (logowanie, grafik, obecność). Zmiany w bazie są wstecznie zgodne (nowe parametry mają wartości domyślne).
- Push w buildach działa normalnie; w Expo Go jest celowo wyłączony (`lib/pushSupport.ts`).

## 3. Web (app.lsoapp.com)
- [ ] `npm run export:web` i wdrożenie jak dotychczas. Linki dla rodziców i kalendarz używają `https://app.lsoapp.com`
  (domyślnie w `lib/shareLinks.ts`, gdy brak `EXPO_PUBLIC_WEB_URL`).

## 4. Po wydaniu
- Dotychczasowi użytkownicy przy pierwszym wejściu widzą „Co nowego?” (treść wg roli, `lib/releaseNotes.ts`) z przyciskiem
  „Pokaż mi, co gdzie jest” → przewodnik. Nowi użytkownicy dostają od razu przewodnik.
- Następne wydanie z nowościami: zmienić `RELEASE_ID` i treść w `lib/releaseNotes.ts`.

## Tekst „Co nowego” do sklepów (App Store / Google Play)
> Nowa wersja LSO App: odświeżony wygląd z kolorami szat liturgicznych i trybem ciemnym. Rozkład Mszy z okresami (październik z różańcem, Adwent z roratami) — daty liczą się same co roku. Obecność bez zapisu i zgłaszanie obecności po fakcie, potwierdzanie także bez internetu. Kilka kościołów i kaplic, automatyczne układanie grafiku, wydruk z kodem QR i grafik dla rodziców. Import ministrantów, tryb zakrystii na tablecie, funkcje liturgiczne, ścieżka formacji, wyzwania sezonowe i własne kategorie punktowania. Przewodnik po aplikacji pokaże, gdzie co jest.

# Punkty, rangi, odznaki, wyzwania i ścieżka formacji

**Po co:** motywować ministrantów (ranking, odznaki, wyzwania) i prowadzić ich przez kolejne stopnie formacji według jasnych wymagań.

## Punkty

- Każda zmiana punktów to wiersz w `points` z `source`:
  - `checkin` — automatycznie za obecność (funkcja meldowania),
  - `manual` — przyznane ręcznie przez opiekuna (`app/(admin)/award-points.tsx`, szybkie +1/+2/+5/−2 w `(admin-tabs)/points.tsx`, zbiorczy import punktów z poprzednich okresów z Excela z wybraną datą wpisu: `app/(admin)/import-points.tsx`),
  - `penalty` — kara za odrzucone usprawiedliwienie,
  - `challenge` — premia za wyzwanie.
- Ile za służbę: **kategorie punktowania parafii** (`point_categories`, np. „Roraty” 8 pkt; przypinane do pozycji rozkładu i służb), a gdy ich nie ma — starsze `point_rules` (Msza z przydziałem / dodatkowa / nabożeństwo / zbiórka). Ekran: `app/(admin)/point-rules.tsx`.
- Korekta punktów za konkretną obecność: `set_attendance_points` (opiekun, „+N pkt” w szczegółach służby i w profilu członka).
- Usunięcie obecności cofa jej punkty (trigger).
- Ekrany: ministrant `app/(tabs)/points.tsx` (ranking, historia), `badge-catalog.tsx`, `member-profile.tsx`; rodzic `(parent-tabs)/points.tsx`.

## Rangi (stopnie)

- `ranks` — stopnie parafii; **systemowe** stopnie są opcjonalne (`parishes.system_ranks_enabled`, domyślnie wyłączone, `rank_available`).
- Nadawanie: opiekun (`app/(admin)/rank-assignment.tsx`), zarządzanie listą: `rank-management.tsx`. Data nadania zapisuje się w `profiles.rank_since`.

## Ścieżka formacji

- Wymagania do stopnia (`rank_requirements`): minimalna liczba służb, miesięcy w obecnym stopniu, frekwencja %, opcjonalnie przeczytane działy/hasła Wiedzy.
- `formation_progress(profil)` liczy postęp (karta `FormationProgressCard` u ministranta), `formation_ready()` — kto spełnił wymagania (lista „Do awansu” u opiekuna: `app/(admin)/promotions.tsx`, kafelek na pulpicie).
- Awans zatwierdza opiekun — system niczego nie zmienia sam.

## Odznaki

- `badge_definitions` (automatyczne i nadawane ręcznie) + `member_badges`. Kryteria automatyczne liczy `lib/badges.ts` (np. „Regularny” — ≥ 80% obecności w 30 dni).
- Zarządzanie: `app/(admin)/badge-management.tsx`.

## Wyzwania sezonowe

- `challenges`: okres (stałe daty albo z kalendarza liturgicznego — szablony w `lib/challenges.ts`), cel (liczba służb pasujących do filtra tytułu / kategorii), premia punktowa.
- Postęp liczy trigger na obecności (`trg_attendance_challenges` → `_challenges_recount`); po osiągnięciu celu powstaje `challenge_completions` i punkty `challenge`.
- Ekrany: opiekun `app/(admin)/challenges.tsx`, ministrant — karty `ChallengeCards` na pulpicie (`challenge_board`).

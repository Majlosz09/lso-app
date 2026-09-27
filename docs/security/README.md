# Audyt bezpieczeństwa i RODO (2026-09-27)

Plan: **wszystko najpierw na LSO-dev**, testujemy (mobile + web), dokładamy kolejne rzeczy, a dopiero potem jedno wdrożenie na produkcję.
Produkcja = prawdziwe parafie, niczego tam nie ruszamy przed etapem D.

## Etap A — odczyty z produkcji (tylko SELECT, nic nie zmieniają)
W panelu Supabase → projekt **LSO** → SQL Editor:
1. `03-list-accounts.sql` → zapisz wynik jako CSV: `docs/security/accounts.csv` (przesiew kont).
2. `02-list-parishes.sql` → CSV: `docs/security/parishes.csv` (przesiew parafii).
3. `01-audit-live.sql` → skopiuj komórkę do `docs/security/audit-result.json`.
4. `04-export-schema.sql` → Export CSV → zapisz jako `supabase/dev/schema-from-prod.csv`; Claude konwertuje go na `.sql` (sama struktura, bez danych).

Pliki wynikowe z danymi osób są w `.gitignore`.

## Etap B — projekt LSO-dev
1. supabase.com → organizacja z projektem LSO → **New project**: nazwa `LSO-dev`, region **Stockholm (eu-north-1)**, zapisz hasło bazy w menedżerze haseł.
2. LSO-dev → SQL Editor → uruchom `supabase/dev/schema-from-prod.sql`.
3. Potem po kolei: `20260927000000_security_hardening.sql`, `20260927000001_delete_my_account.sql`, `20260927000002_drop_legacy_policies.sql` (wszystkie w `supabase/migrations/`).
4. LSO-dev → Database → Extensions: włącz `pg_net` (powiadomienia push), jeśli skrypt go nie włączył.
5. Skopiuj `.env.development.local.example` → `.env.development.local` i wpisz URL + anon key z LSO-dev (Project Settings → API).
6. Authentication → Providers → Email: ustawienia jak na produkcji (np. potwierdzanie maila).

Od teraz `npx expo start` (telefon i `--web`) łączy się z **LSO-dev** i pokazuje zielony znacznik „DEV”.
Jeśli w trybie developerskim apka połączy się z produkcją, pokaże **czerwony pasek „PRODUKCJA”**.

## Etap C — testy na dev (mobile i web)
Konta testowe zakładamy od nowa na dev (`test.onboarding@lso.test`, `test.minister1-3@lso.test`, hasło `TestLSO123!`, skrypty w `scripts/`).
Sprawdzić: rejestracja ministranta (<16 i ≥16 lat) i rodzica kodem, założenie parafii, DM, obecność (samodzielnie i przez admina),
nadanie roli admina, powiadomienie z czatu, usuwanie konta (zwykłe konto i jedyny admin), linki do regulaminu i polityki.

## Etap D — produkcja (na końcu, jednym ruchem)
1. **Kopia zapasowa.** Plan Free nie ma automatycznych kopii. Zainstaluj klienta PostgreSQL (`winget install PostgreSQL.PostgreSQL.17`) i:
   `pg_dump "<connection string LSO z Settings → Database>" -Fc -f backup-lso-RRRR-MM-DD.dump` (plik trzymaj poza repo).
2. Te same trzy migracje co w B3 → potem Edge Functions → `send-push` → Delete. **Pilne:** na produkcji stare polityki otwierają dane wszystkich parafii każdemu zalogowanemu, więc tego kroku nie odkładać na długo.
3. Oznacz nasze/testowe parafie: `update parishes set is_test = true where id in (...);` (lista z etapu A), a zbędne konta testowe usuń.
4. Wdróż stronę (lso-landing: `/regulamin`, `/privacy`) **przed** nową wersją apki, bo apka linkuje do `/regulamin`.
5. Web: `npm run export:web` i wgranie `dist/`. Mobile: nowy build EAS. Web i mobile to ten sam kod, ale wdraża się je osobno.
6. Google Play → App content → Data safety / Account deletion: usunięcie konta w apce + e-mail `lsoapp@parafia-borzapilski.pl`.

## Limity serwera (sprawdź plan: Dashboard → Organization → Billing)
| | Free | Pro (~25 $/mies.) |
|---|---|---|
| Pauza projektu po ~7 dniach bez ruchu | **tak, apka przestaje działać** | nie |
| Kopie zapasowe | **brak** | codzienne, 7 dni |
| Jednoczesne połączenia realtime (czat, live) | ~200 | ~500 |
| Baza danych | 500 MB | 8 GB |
| Aktywni użytkownicy / mies. | 50 000 | 100 000 |
| Transfer | 5 GB | 250 GB |

Wąskie gardło to **realtime**: każda otwarta apka trzyma połączenie. Przy 200 osobach jednocześnie online na Free
kolejne nie dostaną wiadomości na żywo. Przy prawdziwych parafiach: **Pro** (backupy i brak pauzy już same to uzasadniają).
Dokładne limity sprawdzić w Billing, bo Supabase je co jakiś czas zmienia.

## Czego nie da się załatwić kodem (do decyzji / prawnika)
- Weryfikacja przez prawnika: regulamin §6 (powierzenie), kościelny dekret o ochronie danych (KEP 2018) i nadzór KIOD dla parafii katolickich.
- E-mail kontaktowy: `lsoapp@parafia-borzapilski.pl` (ustalone 2026-09-27, podmieniony w całym repo).
- `docs/privacy-policy.html` w tym repo jest nieaktualne: obowiązuje wersja ze strony (lso-landing).
- Numery telefonów widzą wszyscy członkowie parafii (tak działa RLS `profiles_select`). Polityka to teraz uczciwie opisuje;
  ograniczenie tylko do admina wymaga zmian w apce (widok bez telefonu) i osobnej migracji.
- Kod zaproszenia (6 znaków) pokazuje listę ministrantów jeszcze przed rejestracją (ekran rodzica). Do przeniesienia za logowanie.
- Włącz 2FA na koncie Supabase i zmień hasło.

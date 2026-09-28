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

---

# Paczka 2026-09-28 — wdrożenie na produkcję (przed pilotażem 3.10)

Migracje na **LSO (prod)**, po kolei (każda przetestowana na LSO-dev):
1. `20260928000000_admin_tools.sql` — stałe dyżury, usuwanie z parafii, zmiana roli, tryb „Tylko admin”
2. `20260928010000_points_approval_hardening.sql` — punkty (bez podwójnego liczenia), akceptacja członków, doszczelnienia
3. `20260928020000_chat_perf_rodo.sql` — czat (DM wg ustawień parafii, zgłoszenia, limit długości), indeksy, RLS, eksport danych
4. `20260928030000_fix_rls_recursion.sql` — poprawka do 3 (bez niej nie da się założyć parafii) — **zawsze razem z 3**
5. `docs/security/06-find-wrong-roles.sql` — lista kont do ręcznej poprawy (imię = e-mail, założyciel bez admina)

⚠️ Po migracji 2 w parafiach z regułami punktacji sumy w rankingu **spadną o 5 pkt za każdą służbę** (to naprawa podwójnego liczenia) — uprzedź adminów.
⚠️ Po migracji 2 nowe osoby dołączające kodem czekają na zatwierdzenie — admin zatwierdza w zakładce Ministranci (baner na Panelu).

## Konfiguracja w panelach (jednorazowo)
**E-mail (punkt 5 przeglądu)** — Supabase LSO → Authentication:
- Sign In / Providers → Email → **Confirm email: ON**, Minimum password length: **8**
- Emails → SMTP Settings → własny serwer (np. Resend lub Brevo — darmowy plan wystarcza), nadawca `lsoapp@parafia-borzapilski.pl`
  (wbudowany serwer Supabase wysyła tylko kilka maili na godzinę — przy włączonym potwierdzaniu to za mało).
- Apka już obsługuje potwierdzanie: dane z formularza zapisują się przy rejestracji, po kliknięciu linku wystarczy się zalogować.

**Powiadomienia (punkt 3)** — kolejność ma znaczenie:
1. expo.dev → Account settings → Access tokens → Create token
2. Supabase **LSO-dev** i **LSO** → Integrations → Vault → sekret `expo_access_token`
3. Dopiero potem expo.dev → projekt lso-app → Settings → Push notifications → **Enhanced security: ON**

**Kopie zapasowe (punkt 9)** — GitHub → repo lso-app → Settings → Secrets and variables → Actions:
- `SUPABASE_DB_URL` = Supabase LSO → Connect → **Session pooler** (IPv4), z hasłem bazy
- `BACKUP_PASSPHRASE` = długie losowe hasło (zapisz w menedżerze haseł — bez niego kopii nie odtworzysz)
- Test: Actions → „DB backup (encrypted)” → Run workflow. Kopia: artefakt przy uruchomieniu, trzymany 14 dni.

**Buildy testowe (EAS preview)** — expo.dev → projekt → Environment variables → **preview**:
ustaw `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` na **LSO-dev**, żeby testowe APK nie łączyły się z produkcją.

## Świadomie pominięte
- **Sentry (monitoring błędów)** — wymaga nowego pakietu natywnego i konta Sentry; przy jednym darmowym buildzie
  1.10 i pilotażu 3.10 ryzyko nieudanego buildu jest większe niż zysk. Do dodania w kolejnym buildzie natywnym.

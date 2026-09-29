# Redesign v2 — KROK 0: raport różnic funkcjonalnych

Data: 2026-09-29 · gałąź `redesign/v2` · źródło: `design_handoff_lso_redesign/`

Legenda: ✅ jest w kodzie · 🆕 nowe · 🔁 zmienione · DB = wymaga migracji (najpierw LSO-dev) · rozmiar S/M/L

## Odpowiedź w skrócie

**Tak, poza wyglądem zmienia się też część funkcji.** Większość ekranów i przepływów już istnieje (zapisy jednorazowe i cykliczne, wypisy z cyklu, usprawiedliwienia, tryby obecności, ankiety, edycja i usuwanie wiadomości, zgłoszenia z czatu, rangi, odznaki, wiedza parafii, onboarding, reset hasła, ekran oczekiwania). Nowe są przede wszystkim:
- desktopowy layout webowy z bocznym menu,
- centrum powiadomień,
- zamiana z konkretną osobą,
- kilka metod obecności naraz,
- kara −2 pkt za odrzucone usprawiedliwienie,
- nieobecność zgłaszana przez rodzica,
- dwa nowe ustawienia czatu,
- liczniki przeczytanych haseł i ogłoszeń.

---

## 1. Nowe funkcje

| # | Ekran | Opis | DB | Rozmiar |
|---|---|---|---|---|
| N1 | Web (wszystkie) | Layout desktopowy ≥ 1024 px: sidebar, topbar z pigułką dnia i dzwonkiem, modale zamiast bottom sheetów. Dziś web to layout mobilny rozciągnięty na szerokość. | nie | L |
| N2 | Globalne | Kolor nagłówka zależny od koloru szat dnia (`lib/liturgy.ts` ma już kolor dnia, brakuje mapy nagłówków). | nie | S |
| N3 | Globalne | **Centrum powiadomień**: dzwonek, lista, kropka „nowe”. Dziś są tylko pushe, bez historii w aplikacji. | **tak**: tabela `notifications` + zapisy przy zdarzeniach (ogłoszenie, DM, przydział, zatwierdzenie konta, decyzja o usprawiedliwieniu, zamiana) | L |
| N4 | Min · Dom / Grafik | **Prośba o zamianę z konkretną osobą** i status „Czeka na odpowiedź: X”. W bazie prod jest nieużywana tabela `swap_offers`. | **tak**: RLS + RPC `request_swap / respond_swap`, zamiana osoby w `schedule_assignments` po akceptacji, push | M |
| N5 | Min · Grafik | Segmenty Moje / Wszystkie / Wolne (dziś widok tygodnia bez filtrów). | nie | S |
| N6 | Min · Dom | Licznik nieprzeczytanych ogłoszeń na skrócie. | **tak**: tabela `announcement_reads` | S |
| N7 | Min · Dom / web | Karta „Słowo dnia”. **Źródło treści nieznane** (patrz pytania). | zależy | S–M |
| N8 | Min · Wiedza, Profil | Licznik przeczytanych haseł („3 z 8”, ✔ przy haśle, „X z Y haseł” w profilu). „Następne hasło” już jest ✅. | **tak**: `wiedza_reads` (lub lokalnie na urządzeniu, ale wtedy bez synchronizacji web↔telefon) | S |
| N9 | Opiekun · Pulpit | Kafel „Średnia frekwencja”, sekcja „Do zrobienia”, wykres obsady tygodnia, lista najbliższych służb z paskiem obsady. Dziś są 3 kafle i kalendarz miesiąca. | nie (zapytania) | M |
| N10 | Opiekun · Służba | Przycisk „Przypomnij obsadzie” (push do przydzielonych osób). | **tak**: RPC wysyłające push przez `notify_push` / Vault | S |
| N11 | Opiekun · Punkty | Szybkie +1 / +2 / +5 / −2 w wierszu rankingu (dziś jest formularz „Przyznaj punkty”). | nie | S |
| N12 | Opiekun · Statystyki | Zakres Miesiąc / Kwartał / Rok, frekwencja tydzień po tygodniu, podział wg kategorii, frekwencja per ministrant. Dziś są statystyki z ostatnich miesięcy bez przełącznika. | nie | M |
| N13 | Opiekun · Ustawienia | Czat: „Rodzice widzą kanał ogólny” i „Ministranci mogą tworzyć ankiety”. „Wiadomości prywatne” już jest ✅ (`allow_member_dm`). | **tak**: 2 kolumny w `parishes` + RLS kanału ogólnego i `chat_polls` | M |
| N14 | Rodzic · Dyżury | **Zgłoszenie nieobecności w imieniu dziecka** (dziś rodzic ma grafik tylko do odczytu). | **tak**: RPC `report_child_absence` z weryfikacją `parent_id` | M |
| N15 | Rodzic · Dom | Karty dzieci z frekwencją, miejscem w rankingu i najbliższym dyżurem (część danych już jest). | nie | S |
| N16 | Profil ministranta | Wiersz „Połączony rodzic” (tylko do odczytu). | nie | S |

## 2. Zmienione zachowanie

| # | Gdzie | Dziś | W prototypie | DB | Rozmiar |
|---|---|---|---|---|---|
| Z1 | Metody obecności | **Jeden** tryb na parafię (`attendance_mode`: button / qr / gps / admin) | **Kilka naraz** (QR + GPS + samodzielnie + ksiądz), min. 1 włączona | **tak**: `attendance_methods text[]`, `check_in_and_award_points` sprawdza listę; stara kolumna zostaje do migracji prod | M |
| Z2 | Odrzucenie usprawiedliwienia | status `absent` + notatka, **bez kary punktowej** | **−2 pkt** („Odrzucono: X · −2 pkt”) | **tak**: wpis w księdze `points` (source `penalty`) w RPC | S |
| Z3 | Powód nieobecności | dowolny tekst | wybór: Choroba / Szkoła / Wyjazd / Sprawy rodzinne / Inne (+ tekst przy „Inne”) | nie (dalej tekst) | S |
| Z4 | Promień GPS | dowolna liczba (domyślnie 200) | 3 opcje: 50 / 100 / 200 m | nie | S |
| Z5 | Tab bar ministranta | Dyżur · Punkty · **Dom (środek)** · Wiedza · Czat, profil w nagłówku | Dom · Grafik · **Obecność (złoty FAB)** · Punkty · Czat. **Wiedza wypada z tab bara** i trafia do skrótu na Domu. | nie | S |
| Z6 | Tab bar opiekuna | Ministranci · Grafiki · Panel · Ogłoszenia · Punkty · Czat | Pulpit · Grafik · Członkowie · Punkty · Czat. **Ogłoszenia wypadają z tab bara** (zostają w pulpicie / „Szybkich akcjach” i w sidebarze web). | nie | S |
| Z7 | Eksport raportu | PDF / CSV | PDF / CSV / **Excel** | nie (xlsx generowany po stronie klienta, nowa zależność) | S |
| Z8 | Ogłoszenia: adresaci | Wszyscy / Ministranci / Rodzice **+ wybrane rangi** | tylko Wszyscy / Ministranci / Rodzice | — | proponuję **zostawić rangi** |
| Z9 | Ekran Domu ministranta | „Co w kościele” + lista „Nadchodzące służby” + szybkie akcje | karta „Twoja najbliższa służba” (Potwierdź / Zamiana / Nie mogę być) nachodząca na nagłówek, pasek 7 dni, skróty Ogłoszenia/Wiedza | nie (poza N4, N6) | M |

## 3. Usunięte lub przeniesione

**Niczego nie usuwam bez Twojej zgody.** Poniżej jest to, co działa dziś, a czego prototyp nie pokazuje. Proponuję zachować wszystko w nowym stylu:

| Co | Uwaga |
|---|---|
| **Tryb ciemny** (`ThemeContext`, `themeStore`) | Prototyp jest tylko jasny. Decyzja niżej. |
| Reakcje emoji i odpowiedzi (reply) w czacie | Prototyp ich nie pokazuje. Zostają. |
| Słowniczek w Wiedzy (`app/wiedza/slowniczek`) | Prototyp ma go tylko częściowo. Zostaje. |
| Adresaci ogłoszeń wg rangi | patrz Z8 |
| Kalendarz miesięczny na pulpicie opiekuna i ekran `schedule-day` | Prototyp pokazuje tydzień. Proponuję zostawić miesiąc jako „Cały grafik →”. |
| Wybór lokalizacji kościoła na mapie (`GpsLocationPicker`) | Bez tego GPS nie działa. Zostaje w ustawieniach. |
| „Wróć do widoku ministranta” (opiekun) | Zostaje (np. w profilu). |
| „Nowości w LSO App” (`WhatsNewModal`), `EnvBanner`, eksport moich danych (RODO), usuwanie konta, zgody przy rejestracji | Zostają bez zmian funkcji. |
| Rocznik, telefon w profilu | Zostają. |

## 4. Tylko wizualne (funkcje bez zmian, nowy wygląd i układ)

Auth: powitanie, logowanie, reset hasła (modal + „Nowe hasło”), wybór rejestracji, rejestracja (rola, kod z walidacją, dziecko, zgody), nowa parafia, ekran oczekiwania („Sprawdź ponownie”, „Wycofaj prośbę / zmień kod”) — ✅ wszystko istnieje.
Ministrant: Obecność (QR/GPS/przycisk), Punkty (historia, ranking, odznaki, katalog odznak), Czat (kanały, DM, ankiety z głosowaniem i zamykaniem, edycja/usuwanie, zgłaszanie), Ogłoszenia, Wiedza (kategorie → hasła → artykuł), Profil (avatar kolor+ikona lub zdjęcie, edycja imienia, zmiana hasła, usunięcie konta, wylogowanie z potwierdzeniem), profil innego ministranta, nowa wiadomość.
Opiekun: Grafik tygodniowy z przydziałem, Nowa służba (rodzaj, dzień, godzina, role, co tydzień), usuwanie jednej / serii, lista obecności, Członkowie (zatwierdzanie/odrzucanie, profil, ranga, rola/admin, rodzic, usunięcie z parafii), Usprawiedliwienia (poza Z2), Reguły punktów, Rangi (masowo), Odznaki, Wiedza parafii, Zgłoszenia z czatu, Stałe dyżury, Cykl służb, Rozkład Mszy, kod zaproszenia (kopiuj / wygeneruj nowy) + QR do druku, Onboarding parafii.
Rodzic: Punkty, profil dziecka, Ogłoszenia (filtr bez „tylko ministranci”), Czat, Profil.

## Lista kontrolna z README — status

**Globalne:** kolor nagłówka wg szat 🆕 (N2) · centrum powiadomień 🆕 (N3) · toasty ✅ (copy do ujednolicenia 🔁)
**Ministrant:** karta najbliższej służby z 3 akcjami 🔁 (Z9, zamiana 🆕) · pasek 7 dni + „W kościele” ✅ · skróty Ogłoszenia (licznik 🆕 N6) / Wiedza („Słowo dnia” 🆕 N7) · segmenty grafiku 🆕 (N5) · zapis jednorazowo/cyklicznie + wypis z cyklu ✅ · zamiana z osobą 🆕 (N4) · nieobecność z powodem 🔁 (Z3) · tryby obecności 🔁 (Z1) · punkty/ranking/odznaki/katalog ✅ · czat: kanały, DM, ankiety, edycja, usuwanie, zgłaszanie ✅ · wiedza ✅, licznik przeczytanych 🆕 (N8) · profil ✅, połączony rodzic 🆕 (N16)
**Opiekun:** pulpit 🔁/🆕 (N9) · przydział jednym kliknięciem ✅ · nowa służba + seria ✅ · lista obecności ✅ · członkowie ✅ · usprawiedliwienia ✅, −2 pkt 🔁 (Z2) · szybkie punkty 🆕 (N11), reguły ✅ · statystyki 🔁 (N12, Z7) · ustawienia parafii ✅, GPS 🔁 (Z4), metody 🔁 (Z1), czat 🆕 (N13) · rangi, odznaki, wiedza, zgłoszenia, stałe dyżury, cykl ✅ · onboarding ✅
**Rodzic:** dom z kartami dzieci 🔁 (N15) · dyżury ✅, nieobecność za dziecko 🆕 (N14) · ogłoszenia filtrowane ✅
**Auth:** rejestracja ✅ · oczekiwanie ✅ · nowa parafia → onboarding ✅ · reset hasła ✅

## Środowisko testowe (tylko dla nas)

- **Baza:** LSO-dev (`phwoxylvcazcnaifcqab`). Migracje trafiają tylko tam, prod bez zmian.
- **Web:** `npm run export:web` buduje dziś z `.env`, czyli z **prod**. Dodam skrypt `export:web:dev`, który buduje z bazą dev i znacznikiem DEV. Build trafia na osobny adres testowy (Cloudflare Pages: osobny projekt albo deployment gałęzi `redesign`), nie na app.lsoapp.com.
- **Mobile:** kanał EAS `preview` ze zmiennymi dev. Build Androida blokuje limit EAS do 2026-10-01. Do tego czasu testujemy przez `expo start` na telefonie (Expo Go / dev build).
- **Prod** (app.lsoapp.com, sklepy, baza LSO) zostaje nietknięty do Twojej decyzji. Pilot 2026-10-03 idzie na obecnej wersji.

## Pytania i decyzje

1. **Tryb ciemny:** prototyp jest tylko jasny. (a) Zostawiamy ciemny, a ja dorabiam ciemną wersję nowej palety. (b) Na razie tylko jasny, ciemny wraca później.
2. **Kolory nagłówków dla szat fioletowych, różowych i złotych:** akceptujesz propozycję z README (PURPLE `#4A1D5E`, ROSE `#F6DCE4`, GOLD `#F3E3B5`)? Potrzebny jest też czarny (Dzień Zaduszny): proponuję `#1E1E24`.
3. **Fonty:** Instrument Serif + Manrope przez `@expo-google-fonts/*` + `expo-font`. To czysty JS, działa też jako OTA. OK?
4. **Ikony:** Material Symbols to font. Proponuję `@expo/vector-icons/MaterialIcons` / `MaterialCommunityIcons` (już jest w projekcie, 0 KB więcej) zamiast dodawać nowy font.
5. **−2 pkt za odrzucone usprawiedliwienie (Z2):** wprowadzamy? Wartość stała czy do ustawienia w regułach punktów?
6. **„Słowo dnia” (N7):** skąd treść? (a) losowe hasło z Wiedzy, (b) patron/wspomnienie dnia z kalendarza liturgicznego (już jest), (c) ręcznie wpisywane przez opiekuna.
7. **Kilka metod obecności naraz (Z1):** wprowadzamy? To zmiana bazy i funkcji meldowania.
8. **Tab bary (Z5/Z6):** Wiedza i Ogłoszenia wypadają z dolnego paska, a zostają jako skróty. Akceptujesz?
9. **Kolejność funkcji z sekcji 1:** proponuję najpierw cały redesign wizualny (etapy 1–6), potem nowe funkcje osobno w kolejności N4 zamiana → Z1 metody → N14 rodzic → N3 powiadomienia → reszta. Każdą funkcję możesz też odrzucić.
10. **Web testowy:** mam wdrażać sam przez `wrangler` (potrzebny login do Cloudflare), czy wolisz, żebym budował `dist`, a Ty wrzucasz go ręcznie jak dotąd?
11. **lso-landing:** paczka nie zawiera projektu strony. Chodzi o (a) podmianę zrzutów w AppTour/AppShowcase na nowy wygląd po zakończeniu redesignu, (b) przestylowanie landingu na nową paletę (granat/złoto/papier, Instrument Serif), czy (c) o coś jeszcze innego?

---

## Decyzje (2026-09-29)

1. Tryb ciemny zostaje: dorabiam ciemną wersję palety v2 (zrobione w etapie 1).
2. Kolory nagłówków dla fioletu, różu, złota i czerni zaakceptowane.
3. Fonty przez `@expo-google-fonts`, ikony z MaterialCommunityIcons.
4. Kara za odrzucone usprawiedliwienie **ustawiana w regułach punktów** (domyślnie −2, można ustawić 0).
5. „Słowo dnia” z Pisma Świętego: potrzebna baza wersetów, źródło tekstu do ustalenia (prawa autorskie przekładu).
6. Kilka metod obecności naraz: **tak**. Parafia wybiera metodę **główną**, która otwiera się po „Sprawdź obecność”, a pozostałe są alternatywą.
7. Nowe tab bary zaakceptowane.
8. Kolejność: najpierw wizualnie etapy 1–6, potem nowe funkcje.
9. Web testowy wdrażam sam (`wrangler`, osobny projekt Cloudflare Pages), token podaje użytkownik.
10. lso-landing (strona promocyjna Astro) na razie bez zmian.

## Odkrycie po raporcie: role w służbie (N17, zmiana modelu danych)

W raporcie tego zabrakło. Dziś służba **nie ma ról liturgicznych ani liczby miejsc**. Każdy przydział ma `role = 'ministrant'`, a ministrant zapisuje się na godzinę Mszy (`sign_up_for_slot`). Prototyp zakłada służbę z listą ról (Ceremoniarz, Lektor, Akolita, Turyferariusz…), z których każda jest obsadzona albo wolna. Na tym opierają się:
- obsada „2/4”,
- segment „Wolne”,
- „Zapisz się” na konkretną rolę,
- „+ Przydziel” u opiekuna,
- „Wybierz co najmniej jedną rolę” przy tworzeniu służby.

Decyzja w toku.

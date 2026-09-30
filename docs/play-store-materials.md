# Google Play Store — Materiały do publikacji LSO App

## Informacje techniczne

| Pole | Wartość |
|------|---------|
| Package name | `pl.lsoapp.app` |
| Version name | `1.1.0` |
| Version code | nadawany przez EAS (autoIncrement) |
| Target API | 35 (Android 15) |
| Min SDK | 24 (Android 7.0) |

---

## Tytuł aplikacji

```
LSO App
```
*(max 30 znaków — użyto 7)*

---

## Krótki opis (Short description)

*(max 80 znaków)*

```
Grafik, obecność GPS/QR i punkty dla Liturgicznej Służby Ołtarza.
```
*(65 znaków)*

---

## Pełny opis (Full description)

*(max 4000 znaków)*

```
LSO App to aplikacja mobilna stworzona z myślą o grupach Liturgicznej Służby Ołtarza. Eliminuje papierowe listy i chaos organizacyjny — wszystkie potrzebne narzędzia ma w jednym miejscu.

📅 GRAFIK SŁUŻB
Zawsze wiedz, kiedy masz służyć. Przejrzysty kalendarz pokazuje nadchodzące msze i przypisane służby. Nie przegapisz żadnej — aplikacja przypomni Ci z wyprzedzeniem.

📍 WERYFIKACJA OBECNOŚCI (GPS i QR)
Koniec z papierowymi listami. Potwierdzenie obecności zajmuje kilka sekund — GPS lub szybkie skanowanie kodu QR. Animatorzy widzą raport obecności całej grupy w czasie rzeczywistym.

🏆 PUNKTY I RANKINGI
Każda służba to punkty. Automatyczny system naliczania nagradza regularne zaangażowanie. Ranking motywuje ministrantów i sprawia, że posługa staje się wyzwaniem — w dobrym sensie.

💬 KOMUNIKACJA
Wewnętrzny czat dla grupy LSO. Ważne ogłoszenia i informacje docierają do wszystkich od razu — bez konieczności przesyłania wiadomości przez prywatne komunikatory.

─────────────────────────────────

DLA MINISTRANTÓW
• Sprawdzasz grafik → wiesz, kiedy służysz
• Potwierdzasz obecność jednym kliknięciem
• Śledzisz swój wynik i pozycję w rankingu
• Czytasz ogłoszenia grupy

DLA ANIMATORÓW
• Tworzysz i edytujesz grafik służb
• Przypisujesz ministrantów do mszy
• Monitorujesz obecność całej grupy
• Komunikujesz się ze wszystkimi naraz
• Zarządzasz systemem punktów

─────────────────────────────────

BEZPIECZEŃSTWO I PRYWATNOŚĆ
• Każda parafia ma oddzielną, izolowaną przestrzeń
• Dane przechowywane w bezpiecznej infrastrukturze europejskiej (Supabase EU)
• Lokalizacja używana wyłącznie do weryfikacji obecności — nie śledzimy Cię w tle
• Aparat tylko do skanowania QR — żadnych zdjęć nie zapisujemy
• Brak reklam, brak sprzedaży danych

Polityka prywatności: https://lsoapp.com/privacy
```

*(~1 980 znaków — dużo miejsca na rozszerzenie)*

---

## Co nowego (What's new / Changelog v1.0.0)

*(max 500 znaków)*

```
Pierwsze wydanie aplikacji LSO App!

• Grafik służb z kalendarzem
• Weryfikacja obecności przez GPS i kody QR
• System punktów i rankingów
• Wewnętrzny czat grupy
• Obsługa wielu parafii
```

---

## Kategoria i tagi

| Pole | Wartość |
|------|---------|
| Kategoria | Styl życia (Lifestyle) |
| Tagi | kościół, ministranci, liturgia, grafik, parafia |
| Ocena treści | Dla wszystkich (Everyone) |
| Interaktywne elementy | Cyfrowe zakupy: NIE / Udostępnianie lokalizacji: TAK (tylko podczas weryfikacji) |

---

## Dane kontaktowe dla Play Store

| Pole | Wartość |
|------|---------|
| Email wsparcia | lsoapp@parafia-borzapilski.pl |
| Strona internetowa | https://lsoapp.com |
| Polityka prywatności | https://lsoapp.com/privacy |
| Telefon | (opcjonalny — można pominąć) |

---

## Checklist przed wysłaniem do review

### Wymagane pliki
- [ ] Ikona aplikacji: **512×512 px PNG** (bez zaokrąglonych rogów — Google robi to samo)
- [ ] Feature graphic: **1024×500 px JPG/PNG** (baner widoczny na stronie aplikacji)
- [ ] Zrzuty ekranu (screenshoty): min. 2, maks. 8 na urządzenie
  - Telefon: min. **1080×1920 px** (pionowo)
  - Zalecane screenshoty: Grafik, Weryfikacja obecności, Punkty, Chat
- [ ] Plik AAB (`.aab`) z EAS production build

### Konfiguracja konta Play Developer
- [ ] Konto Google Play Developer założone ($25 jednorazowo)
- [ ] Dane bankowe / podatkowe uzupełnione
- [ ] Merchant account skonfigurowany (jeśli aplikacja płatna — tutaj darmowa)

### Ustawienia aplikacji w Play Console
- [ ] Polityka prywatności URL wpisana: `https://lsoapp.com/privacy`
- [ ] Deklaracja uprawnień wyjaśniona:
  - CAMERA → skanowanie kodów QR (weryfikacja obecności)
  - ACCESS_FINE_LOCATION → GPS check-in na mszy
  - RECEIVE_BOOT_COMPLETED → powiadomienia push po restarcie
- [ ] Formularz Data Safety wypełniony:
  - Lokalizacja: TAK (przybliżona, tylko w czasie weryfikacji, nie udostępniana)
  - Aparat: TAK (skanowanie QR, nie przechowywany)
  - Email: TAK (konto użytkownika, nie udostępniany)

### Komendy EAS do buildu produkcyjnego
```bash
# Zaloguj się jeśli nie jesteś zalogowany:
eas login

# Build produkcyjny (AAB):
eas build --platform android --profile production

# Po zatwierdzeniu przez Google Play, submit (opcjonalnie):
eas submit --platform android --latest
```

---

## Propozycja zrzutów ekranu (screenshoty)

Kolejność zalecana:

1. **Grafik** — ekran z kalendarzem i listą nadchodzących służb
2. **Moja służba** — szczegóły przypisanej mszy (data, godzina, "Twoja służba")
3. **Weryfikacja obecności** — ekran z przyciskiem GPS lub QR
4. **Punkty i ranking** — karta punktów + tabela rankingowa
5. **Chat** — lista wiadomości grupy
6. **Login** — ekran logowania (opcjonalnie)

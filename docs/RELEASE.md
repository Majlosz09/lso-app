# Wydawanie wersji LSO App

Aplikacja ma trzy części, każda wdrażana osobno. **Kolejność: baza → strona → web → mobile.**

| Część | Gdzie | Jak |
|---|---|---|
| Baza | Supabase projekt **LSO** (prod) | SQL Editor → nowe pliki z `supabase/migrations/` (najpierw zawsze na **LSO-dev**) |
| Strona (lsoapp.com) | Cloudflare, repo `lso-landing` | `git push origin main` → wdraża się sama |
| Web (app.lsoapp.com) | Cloudflare Pages (upload ręczny) | `npm run export:web` → Workers & Pages → projekt app.lsoapp.com → Create deployment → zawartość `dist/` |
| Mobile — kod JS | EAS Update (bez sklepu) | `npm run update:production -- --message "opis"` |
| Mobile — natywne | EAS Build + sklep | `npx eas build -p android --profile production` → Play Console |

## Aktualizacja bez sklepu (EAS Update) — od wersji 1.1.0
- Działa tylko dla zmian w kodzie JS/TS i zasobach (ekrany, logika, teksty).
- **Nie** działa dla: nowych pakietów natywnych (`npx expo install …` z kodem natywnym), zmian w `app.json`
  dotyczących uprawnień/ikon/splash, zmiany wersji Expo SDK. Wtedy potrzebny nowy build i sklep.
- Aktualizacja trafia tylko do buildów z **tą samą wersją** (`runtimeVersion: appVersion`):
  update wydany przy `"version": "1.1.0"` dotrze wyłącznie do instalacji 1.1.0. Wersja 1.0.0 (bez expo-updates)
  nigdy nie dostanie OTA — ci użytkownicy muszą zaktualizować apkę ze sklepu.
- Telefon pobiera aktualizację przy starcie, stosuje ją przy **kolejnym** uruchomieniu.
- `eas update` buduje z lokalnego `.env` (produkcja). `.env.development.local` nie jest wtedy wczytywany.
  Po wydaniu sprawdź na telefonie, że **nie** widać znacznika „DEV”.
- Wycofanie złej aktualizacji: `npx eas update:rollback` albo wydanie poprzedniego commita.

## Przed każdym wydaniem
1. Migracje przetestowane na LSO-dev, testy: `node scripts/security-smoke-dev.mjs`,
   `node scripts/admin-tools-smoke-dev.mjs`, `node scripts/points-approval-smoke-dev.mjs`.
2. `npx tsc --noEmit` bez nowych błędów w zmienionych plikach.
3. Web i mobile sprawdzone przez `npx expo start` (znacznik „DEV”).

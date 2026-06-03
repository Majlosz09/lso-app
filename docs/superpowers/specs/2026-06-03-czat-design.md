# Moduł Czatu — Design

**Status:** Zatwierdzony  
**Data:** 2026-06-03

---

## Cel

Dwustronna komunikacja na żywo w obrębie parafii. Zastępuje WhatsApp jako główny kanał kontaktu admin↔ministranci i admin↔rodzice. Opcjonalnie: ministranci między sobą.

---

## Struktura kanałów

Przy tworzeniu parafii automatycznie powstają dwa kanały grupowe:
- `#ministranci` — admin + wszyscy ministranci
- `#rodzice` — admin + wszyscy rodzice

**Prywatne DM (1:1):**
- Admin może zainicjować rozmowę z dowolnym użytkownikiem
- Ministrant ↔ ministrant — opcjonalnie, sterowane przełącznikiem w ustawieniach parafii

**Widoczność per rola:**
- Ministrant: `#ministranci` + własne DM
- Rodzic: `#rodzice` + własne DM
- Admin: wszystkie kanały + wszystkie DM

---

## Architektura techniczna

### Tabele

```sql
chat_channels (
  id uuid PK,
  parish_id uuid FK parishes,
  type text CHECK (type IN ('group', 'dm')),
  name text,           -- np. "ministranci", "rodzice" lub null dla DM
  slug text,           -- np. "ministranci"
  created_at timestamptz
)

chat_members (
  channel_id uuid FK chat_channels,
  user_id uuid FK profiles,
  last_read_at timestamptz,
  PRIMARY KEY (channel_id, user_id)
)

chat_messages (
  id uuid PK,
  channel_id uuid FK chat_channels,
  sender_id uuid FK profiles,
  content text NOT NULL,
  created_at timestamptz DEFAULT now(),
  deleted_at timestamptz  -- soft delete
)
```

RLS: użytkownik widzi tylko wiadomości z kanałów, do których należy (`chat_members`).

### Realtime

Supabase Realtime — subskrypcja na `chat_messages` filtrowana po `channel_id`. Wiadomości pojawiają się natychmiast. Ten sam mechanizm co istniejące subskrypcje na `profiles` i `badges`.

### Powiadomienia push

Gdy app jest w tle: nowa wiadomość → Supabase Edge Function → Expo Push API. Wykorzystuje istniejący mechanizm push notifications z projektu. Nie wysyłamy notyfikacji nadawcy ani użytkownikom z otwartym tym kanałem (last_read_at ≥ created_at).

### Moderacja

- Admin może usunąć dowolną wiadomość (soft delete)
- Użytkownik może usunąć tylko własną wiadomość
- Usunięte wiadomości wyświetlane jako "Wiadomość usunięta" (nie znikają z wątku)

---

## UI

### Nowa zakładka `Czat`

Dodana jako piąta pozycja w tab barze. Ikona: `chatbubbles-outline` (Ionicons). Badge z łączną liczbą nieprzeczytanych wiadomości.

### Ekran listy kanałów (`(tabs)/chat.tsx`)

- Kanały grupowe na górze
- DM poniżej
- Per kanal: avatar/ikona, nazwa, ostatnia wiadomość (truncated), czas, badge nieprzeczytanych
- Przycisk nowego DM (`+`) — widoczny dla admina zawsze; dla ministranta tylko jeśli parafia zezwala

### Ekran rozmowy (`chat/[channelId].tsx`)

- Wiadomości chronologicznie, najnowsze na dole (FlatList inverted)
- Avatar + imię tylko przy pierwszej wiadomości w serii tego samego nadawcy
- Pole tekstowe z przyciskiem wyślij na dole
- Long-press → menu: "Usuń wiadomość" (własna lub każda dla admina)
- Usunięta wiadomość → placeholder "Wiadomość usunięta"

---

## Ustawienia parafii

Nowy przełącznik w Parish Settings:
- `allow_member_dm` (boolean, default: false) — czy ministranci mogą pisać DM między sobą

---

## Poza zakresem

- Edycja wysłanej wiadomości
- Reakcje / emoji
- Wysyłanie zdjęć / plików
- Wątki (threads)
- Statusy odczytu per użytkownik ("widziany przez X osób")

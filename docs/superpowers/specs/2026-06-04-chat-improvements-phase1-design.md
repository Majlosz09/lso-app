# Chat Improvements — Phase 1

**Data:** 2026-06-04  
**Projekt:** lso-app (Expo/React Native + Supabase)  
**Zakres:** Phase 1 z dwufazowego planu ulepszenia czatu

---

## Zakres Phase 1

1. Enter/send (mobile vs web)
2. Reakcje emoji (6 fixedowanych)
3. Edytowanie wiadomości
4. Odpowiedź na wiadomość (z cytatem)
5. Ankiety (elastyczny format)

**Phase 2 (osobny spec):** @wzmianki, wysyłanie zdjęć, przypięte wiadomości, potwierdzenia przeczytania.

---

## 1. Baza danych (Supabase)

### Rozszerzenie `chat_messages`

```sql
ALTER TABLE chat_messages
  ADD COLUMN type        text    DEFAULT 'text',
  ADD COLUMN reply_to_id uuid    REFERENCES chat_messages(id),
  ADD COLUMN edited_at   timestamptz,
  ADD COLUMN poll_id     uuid REFERENCES chat_polls(id);
```

Wartości `type`: `'text'` | `'poll'`.

### Nowe tabele

```sql
-- Reakcje emoji
CREATE TABLE chat_reactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  uuid REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES profiles(id) ON DELETE CASCADE,
  emoji       text NOT NULL,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);

-- Ankiety
CREATE TABLE chat_polls (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id     uuid REFERENCES chat_channels(id),
  creator_id     uuid REFERENCES profiles(id),
  question       text NOT NULL,
  allow_multiple boolean DEFAULT false,
  closed_at      timestamptz,
  created_at     timestamptz DEFAULT now()
);

CREATE TABLE chat_poll_options (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id  uuid REFERENCES chat_polls(id) ON DELETE CASCADE,
  text     text NOT NULL,
  position integer NOT NULL
);

CREATE TABLE chat_poll_votes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  option_id  uuid REFERENCES chat_poll_options(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (option_id, user_id)
);
```

### RLS

| Tabela | INSERT | UPDATE | DELETE | SELECT |
|---|---|---|---|---|
| `chat_reactions` | `user_id = auth.uid()` | — | `user_id = auth.uid()` | członkowie kanału |
| `chat_polls` | każdy członek kanału | `creator_id = auth.uid()` lub admin | `creator_id = auth.uid()` lub admin | członkowie kanału |
| `chat_poll_options` | przez twórcę ankiety | — | — | członkowie kanału |
| `chat_poll_votes` | `user_id = auth.uid()` | — | `user_id = auth.uid()` | członkowie kanału |

---

## 2. Typy TypeScript (`types/chat.ts`)

### Rozszerzenia istniejących typów

```ts
// ChatMessage — nowe pola
type: 'text' | 'poll'
reply_to_id: string | null
edited_at: string | null
poll_id: string | null

// ChatMessageWithSender — nowe pola
reply_to: { id: string; content: string; sender: { full_name: string } | null } | null
reactions: ChatReaction[]
poll: ChatPoll | null
```

### Nowe typy

```ts
export interface ChatReaction {
  id: string
  message_id: string
  user_id: string
  emoji: string
  created_at: string
}

export interface ChatPoll {
  id: string
  channel_id: string
  creator_id: string
  question: string
  allow_multiple: boolean
  closed_at: string | null
  created_at: string
  options: ChatPollOption[]
}

export interface ChatPollOption {
  id: string
  poll_id: string
  text: string
  position: number
  votes: ChatPollVote[]
}

export interface ChatPollVote {
  id: string
  option_id: string
  user_id: string
}
```

---

## 3. Architektura komponentów

### Nowe pliki

```
components/chat/
  MessageBubble.tsx       — wyciągnięty z [channelId].tsx; renderuje tekst lub ankietę + reakcje
  ReactionBar.tsx         — poziomy pasek 6 emoji: 👍 ❤️ 😂 😮 😢 🙏
  MessageActionSheet.tsx  — dolny sheet: pasek emoji na górze + lista akcji poniżej
  ReplyPreview.tsx        — baner nad inputem "Odpowiadasz [imię]: [cytat]" z przyciskiem ✕
  PollBubble.tsx          — dymek ankiety: pytanie + opcje z paskami % + głosowanie
  CreatePollModal.tsx     — modal: pole pytania, lista opcji (min 2/max 6), toggle wielokrotny

hooks/
  useChatReactions.ts     — logika toggle reakcji (insert/delete)
  useChatPolls.ts         — logika głosowania (single: upsert, multi: toggle)
```

### Zmiany istniejących plików

- **`app/chat/[channelId].tsx`** — uproszczony: deleguje do `MessageBubble`; stan `replyTo` i `editingMessage`; przycisk 📊 w inpucie
- **`hooks/useChatMessages.ts`** — rozszerzony select z joinem reakcji i ankiety; dodatkowe subskrypcje na `chat_reactions` i `chat_poll_votes`
- **`types/chat.ts`** — jak w sekcji 2

---

## 4. Przepływ danych

### Fetch wiadomości

```ts
supabase.from('chat_messages')
  .select(`
    *,
    sender:profiles(id, full_name, avatar_url, role),
    reply_to:chat_messages(id, content, sender:profiles(full_name)),
    reactions:chat_reactions(*),
    poll:chat_polls(*, options:chat_poll_options(*, votes:chat_poll_votes(*)))
  `)
  .eq('channel_id', channelId)
  .is('deleted_at', null)
  .order('created_at', { ascending: false })
  .limit(50)
```

### Real-time subskrypcje

Wszystkie triggerują `fetchMessages()`:
- `chat_messages` (istniejąca)
- `chat_reactions` (nowa)
- `chat_poll_votes` (nowa)

### Tworzenie ankiety

1. User tapuje 📊 → `CreatePollModal`
2. Walidacja: min 2 opcje, pytanie niepuste
3. `INSERT chat_polls` → `INSERT chat_poll_options` (sekwencyjnie)
4. `INSERT chat_messages` (type='poll', poll_id=nowe poll.id)

### Głosowanie

- **Single choice:** `DELETE FROM chat_poll_votes WHERE user_id = auth.uid() AND option_id IN (SELECT id FROM chat_poll_options WHERE poll_id = X)` → INSERT nowy głos
- **Multi choice:** toggle — INSERT jeśli brak, DELETE jeśli był

### Reakcje

- Tap emoji: `INSERT chat_reactions ON CONFLICT DO NOTHING`
- Tap własnej reakcji (chip): `DELETE WHERE message_id AND user_id AND emoji`

### Edytowanie wiadomości

```sql
UPDATE chat_messages SET content = $1, edited_at = now()
WHERE id = $2 AND sender_id = auth.uid()
```

---

## 5. Zachowanie Enter/Send

| Platforma | Enter | Shift+Enter |
|---|---|---|
| Mobile (iOS/Android) | Wysyła wiadomość (`onSubmitEditing`) | Brak Shift — przycisk `⏎` w inpucie wstawia `\n` |
| Web (`Platform.OS === 'web'`) | Wysyła wiadomość (`onKeyPress` handler) | Wstawia `\n` |

Na web: handler `onKeyPress` na `TextInput` z warunkiem `e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey`. W React Native Web `nativeEvent` eksponuje `shiftKey`.

---

## 6. Menu kontekstowe (long press)

Styl: pasek emoji na górze + lista akcji poniżej (jak WhatsApp/iMessage).

```
[ 👍  ❤️  😂  😮  😢  🙏 ]   ← ReactionBar
────────────────────────────
  💬  Odpowiedz
  ✏️  Edytuj           (tylko własne, nie dotyczy poll)
  🗑️  Usuń             (własne lub admin; kolor czerwony)
```

Edytuj i Usuń nie pojawiają się dla wiadomości innych użytkowników (jeśli nie-admin).

---

## 7. Obsługa błędów i edge case'y

- **Reakcja na usuniętą wiadomość:** `ReactionBar` nie wyświetla się gdy `deleted_at` ustawione
- **Głosowanie na zamkniętą ankietę:** opcje `disabled` gdy `closed_at` ustawione (sprawdzane lokalnie)
- **Ankieta z 0 głosami:** paski 0%, label "Brak głosów"
- **Cytowana wiadomość usunięta:** wyświetla `"Wiadomość usunięta"` w cytacie
- **Odpowiedź na odpowiedź:** wyświetlamy tylko jeden poziom cytatu (brak rekurencji)
- **Edytowanie wiadomości typu poll:** zablokowane
- **Błąd reakcji/głosu:** Toast z komunikatem, brak optimistic update

---

## 8. Podejście fazowe

**Phase 1 (ten spec):** Enter/send, reakcje, edytowanie, odpowiedź, ankiety

**Phase 2 (osobny spec):** @wzmianki, wysyłanie zdjęć, przypięte wiadomości, potwierdzenia przeczytania

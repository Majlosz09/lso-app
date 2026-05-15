# Realtime Updates — Design Spec

**Data:** 2026-05-15
**Status:** Approved

---

## Cel

Zastąpienie ręcznego odświeżania (pull-to-refresh, focus trigger) automatycznym wykrywaniem zmian w bazie danych przez Supabase Realtime. Gdy admin doda ogłoszenie, przyzna punkty lub zmieni służbę — ministranci widzą to natychmiast, bez dotykania ekranu.

---

## Technologia

**Supabase Realtime — postgres_changes**

Supabase nasłuchuje na zmiany w tabelach PostgreSQL (INSERT, UPDATE, DELETE) i przesyła zdarzenia do podłączonych klientów przez WebSocket. Dostępne na darmowym planie (200 połączeń równoczesnych, 2 mln wiadomości/miesiąc — wystarczające dla tej aplikacji).

---

## Architektura

### Nowy plik: `hooks/useRealtimeTable.ts`

Wielokrotnego użytku hook subskrybujący zmiany na konkretnej tabeli Supabase:

```ts
import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

export function useRealtimeTable(table: string, onUpdate: () => void) {
  const ref = useRef(onUpdate)
  ref.current = onUpdate

  useEffect(() => {
    const channel = supabase
      .channel(`realtime-${table}-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        ref.current()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [table])
}
```

**Kluczowe decyzje projektowe:**
- `useRef` do przechowywania `onUpdate` — callback zawsze aktualny bez ponownego tworzenia kanału przy każdym renderze
- `Date.now()` w nazwie kanału — unikalna nazwa dla każdej instancji hooka
- Subskrypcja tworzona przy montowaniu komponentu, czyszczona przy odmontowaniu
- Nasłuchuje na wszystkie zdarzenia (`event: '*'`) — INSERT, UPDATE, DELETE
- Nie parsuje payloadu zdarzenia — wywołuje pełny re-fetch (prostsze, zawsze spójne z bazą)

---

## Integracja z ekranami

Każdy ekran dostaje jedną linijkę z hookiem. Tabele i callbacki:

| Ekran | Plik | Tabela Supabase | Callback re-fetch |
|-------|------|-----------------|-------------------|
| Ogłoszenia | `app/(tabs)/announcements.tsx` | `announcements` | `fetchAnnouncements()` |
| Dyżur | `app/(tabs)/schedule.tsx` | `schedule_assignments` | `fetchMine()` + `fetchSignup()` |
| Dom | `app/(tabs)/index.tsx` | `schedule_assignments` | `fetchData()` |
| Punkty | `app/(tabs)/points.tsx` | `points` | `fetchPoints()` |

Przykład użycia w komponencie:

```ts
useRealtimeTable('announcements', fetchAnnouncements)
```

---

## Czego ta specyfikacja NIE obejmuje

- Filtrowanie zdarzeń po `user_id` lub `parish_id` na poziomie subskrypcji (niepotrzebne przy tej skali, komplikuje kod)
- Optymistyczne aktualizacje UI (nie modyfikujemy stanu na podstawie payloadu zdarzenia — zawsze pełny re-fetch)
- Push notifications gdy aplikacja jest zamknięta (osobny feature #3 na roadmapie — nie zależy od tej architektury)
- Realtime dla ekranów admina (admin i tak ma `useFocusEffect`, zmiany robi sam)
- Obsługa braku połączenia / reconnect (Supabase JS client obsługuje to automatycznie)

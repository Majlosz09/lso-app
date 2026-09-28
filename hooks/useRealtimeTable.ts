import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

// Definicja typu dla danych przychodzących z Supabase
type RealtimePayload<T = any> = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  new: T
  old: T
  schema: string
  table: string
}

// Dodaliśmy <T = any>, aby hook przyjmował typ generyczny
export function useRealtimeTable<T = any>(
  table: string, 
  onUpdate: (payload: RealtimePayload<T>) => void, // onUpdate przyjmuje teraz payload
  filter?: string
) {
  const ref = useRef(onUpdate)
  ref.current = onUpdate

  useEffect(() => {
    const uniqueId = Math.random().toString(36).substring(2, 9)
    const channelName = `realtime-${table}-${uniqueId}`

    const handler = (payload: unknown) => ref.current(payload as RealtimePayload<T>)
    let channel = supabase.channel(channelName)
    if (filter) {
      // Filtr (np. parish_id=eq.X) ogranicza INSERT/UPDATE do własnej parafii — serwer nie sprawdza
      // uprawnień każdego subskrybenta dla zmian z innych parafii. DELETE nie da się filtrować
      // (Realtime nie filtruje usunięć), więc usunięcia słuchamy bez filtra — są tanie (sam klucz).
      channel = channel
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter }, handler)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table, filter }, handler)
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, handler)
    } else {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, handler)
    }
    channel
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' && err) {
          console.error(`[useRealtimeTable] Błąd subskrypcji kanału ${channelName}:`, err)
        }
      })

    return () => { 
      supabase.removeChannel(channel) 
    }
  }, [table, filter])
}
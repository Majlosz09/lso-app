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

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table, 
          ...(filter ? { filter } : {}) 
        }, 
        (payload) => { 
          // Przekazujemy pełny payload do callbacku
          ref.current(payload as unknown as RealtimePayload<T>)
        }
      )
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
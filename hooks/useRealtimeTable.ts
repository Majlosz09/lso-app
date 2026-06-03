import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

let _channelId = 0

export function useRealtimeTable(table: string, onUpdate: () => void, filter?: string) {
  const ref = useRef(onUpdate)
  ref.current = onUpdate

  useEffect(() => {
    const channel = supabase
      .channel(`realtime-${table}-${++_channelId}`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on('postgres_changes', { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) } as any, () => { ref.current() })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  // ref.current always holds the latest onUpdate — omitting it from deps is intentional
  }, [table, filter])
}

import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

let _channelId = 0

export function useRealtimeTable(table: string, onUpdate: () => void) {
  const ref = useRef(onUpdate)
  ref.current = onUpdate

  useEffect(() => {
    const channel = supabase
      .channel(`realtime-${table}-${++_channelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        ref.current()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  // ref.current always holds the latest onUpdate — omitting it from deps is intentional
  }, [table])
}

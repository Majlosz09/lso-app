import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'

export type Church = {
  id: string
  parish_id: string
  name: string
  short_name: string | null
  is_main: boolean
  lat: number | null
  lng: number | null
  gps_radius: number
  sort_order: number
}

/** Krótka nazwa do znaczków („Zalesie”), pełna jako zapas. */
export const churchLabel = (c: Pick<Church, 'name' | 'short_name'>) => c.short_name?.trim() || c.name

/** Kościoły parafii (główny pierwszy). `multi` = więcej niż jeden — tylko wtedy pokazujemy wybór kościoła. */
export function useChurches() {
  const parishId = useAuthStore(s => s.profile?.parish_id)
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['churches', parishId],
    enabled: !!parishId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Church[]> => {
      const { data, error } = await supabase.from('churches').select('*').eq('parish_id', parishId!)
      if (error) return [] // baza bez migracji kościołów — działamy jak z jednym kościołem
      return ((data ?? []) as Church[]).sort((a, b) => Number(b.is_main) - Number(a.is_main) || a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'pl'))
    },
  })
  const churches = data ?? []
  const main = churches.find(c => c.is_main) ?? null
  const byId = Object.fromEntries(churches.map(c => [c.id, c])) as Record<string, Church>
  return {
    churches, main, byId, loading: isLoading, multi: churches.length > 1,
    refresh: () => qc.invalidateQueries({ queryKey: ['churches', parishId] }),
  }
}

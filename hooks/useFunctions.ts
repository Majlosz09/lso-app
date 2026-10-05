import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'

export type ParishFunction = { id: string; name: string; description: string | null; sort_order: number }

/** Funkcje liturgiczne parafii + kto je ma (wszyscy w parafii widzą, opiekun zmienia). */
export function useFunctions() {
  const parishId = useAuthStore(s => s.profile?.parish_id)
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['functions', parishId],
    enabled: !!parishId,
    staleTime: 60_000,
    queryFn: async () => {
      const [f, m] = await Promise.all([
        supabase.from('parish_functions').select('id, name, description, sort_order').eq('parish_id', parishId!).order('sort_order').order('name'),
        supabase.from('member_functions').select('profile_id, function_id').eq('parish_id', parishId!),
      ])
      if (f.error) return { functions: [] as ParishFunction[], held: [] as { profile_id: string; function_id: string }[] }
      return { functions: (f.data ?? []) as ParishFunction[], held: (m.data ?? []) as { profile_id: string; function_id: string }[] }
    },
  })
  const functions = data?.functions ?? []
  const held = data?.held ?? []
  const byProfile = new Map<string, Set<string>>()
  for (const h of held) {
    if (!byProfile.has(h.profile_id)) byProfile.set(h.profile_id, new Set())
    byProfile.get(h.profile_id)!.add(h.function_id)
  }
  /** Funkcja wymagana przez rolę o tej nazwie (jak role_required_function w SQL). */
  const requiredFor = (roleName: string) =>
    functions.find(f => f.name.trim().toLowerCase() === roleName.trim().toLowerCase()) ?? null
  const has = (profileId: string, functionId: string) => byProfile.get(profileId)?.has(functionId) ?? false
  return {
    functions, loading: isLoading, byProfile, requiredFor, has,
    refresh: () => qc.invalidateQueries({ queryKey: ['functions', parishId] }),
  }
}

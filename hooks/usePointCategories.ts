// Własne kategorie punktowania parafii (np. „Roraty” 8 pkt). Migracja 20261006010000.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'

export type PointCategory = {
  id: string
  name: string
  icon: string
  points: number
  for_services: boolean
  for_manual: boolean
}

export function usePointCategories() {
  const parishId = useAuthStore(s => s.profile?.parish_id)
  const [categories, setCategories] = useState<PointCategory[]>([])
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    if (!parishId) return
    const { data } = await supabase.from('point_categories')
      .select('id, name, icon, points, for_services, for_manual').eq('parish_id', parishId).order('name')
    setCategories((data ?? []) as PointCategory[])
    setLoading(false)
  }, [parishId])
  useEffect(() => { load() }, [load])
  return {
    categories,
    serviceCategories: categories.filter(c => c.for_services),
    manualCategories: categories.filter(c => c.for_manual),
    loading,
    reload: load,
  }
}

import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../stores/authStore'
import { ensureReads, useReadsStore, visibleAnnouncementIds } from '../stores/readsStore'

/** N6: liczba nieprzeczytanych ogłoszeń (ministrant / rodzic). 0 przed migracją content_reads. */
export function useUnreadAnnouncements(enabled = true): number {
  const profile = useAuthStore(s => s.profile)
  const reads = useReadsStore(s => s.announcement)
  const available = useReadsStore(s => s.available)
  const on = enabled && !!profile?.parish_id && profile.role !== 'admin' && !profile.is_admin

  useEffect(() => { if (on) ensureReads(profile?.id) }, [on, profile?.id])
  const { data: ids } = useQuery({
    queryKey: ['announcement-ids', profile?.id, profile?.rank_id],
    enabled: on,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: () => visibleAnnouncementIds(profile),
  })

  if (!on || !available || !ids) return 0
  return ids.filter(id => !reads.has(id)).length
}

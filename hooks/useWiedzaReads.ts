import { useEffect } from 'react'
import { useAuthStore } from '../stores/authStore'
import { ensureReads, useReadsStore } from '../stores/readsStore'
import { wiedzaKey } from '../lib/wiedza'

/** N8: przeczytane hasła Wiedzy (Set kluczy) + czy baza je obsługuje. */
export function useWiedzaReads() {
  const profileId = useAuthStore(s => s.profile?.id)
  const reads = useReadsStore(s => s.wiedza)
  const available = useReadsStore(s => s.available)
  useEffect(() => { ensureReads(profileId) }, [profileId])
  return { reads, available }
}

/** N8: otwarcie hasła = przeczytane. */
export function useMarkWiedzaRead(categoryId: string | undefined, itemId: string | undefined) {
  const profileId = useAuthStore(s => s.profile?.id)
  const available = useReadsStore(s => s.available)
  const markRead = useReadsStore(s => s.markRead)
  useEffect(() => { ensureReads(profileId) }, [profileId])
  useEffect(() => {
    if (profileId && categoryId && itemId) markRead(profileId, 'wiedza', wiedzaKey(categoryId, itemId))
  }, [profileId, categoryId, itemId, available])
}

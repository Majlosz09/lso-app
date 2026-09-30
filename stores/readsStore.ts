// N6 / N8: przeczytane ogłoszenia i hasła Wiedzy (tabela content_reads, synchronizacja web ↔ telefon).
// Przed migracją 20261001040000 tabeli nie ma — wtedy nic nie jest „przeczytane”, a zapis po cichu się nie udaje.
import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types/database'

export type ReadKind = 'announcement' | 'wiedza'

type ReadsState = {
  loadedFor: string | null
  /** false, gdy baza nie ma jeszcze tabeli — liczniki się wtedy nie pokazują */
  available: boolean
  announcement: Set<string>
  wiedza: Set<string>
  load: (profileId: string) => Promise<void>
  markRead: (profileId: string, kind: ReadKind, key: string) => void
}

export const useReadsStore = create<ReadsState>((set, get) => ({
  loadedFor: null,
  available: false,
  announcement: new Set(),
  wiedza: new Set(),

  load: async (profileId) => {
    const { data, error } = await supabase.from('content_reads').select('kind, item_key').eq('profile_id', profileId)
    if (error) { set({ loadedFor: profileId, available: false }); return }
    const announcement = new Set<string>()
    const wiedza = new Set<string>()
    for (const r of (data ?? []) as { kind: ReadKind; item_key: string }[]) {
      (r.kind === 'announcement' ? announcement : wiedza).add(r.item_key)
    }
    set({ loadedFor: profileId, available: true, announcement, wiedza })
  },

  markRead: (profileId, kind, key) => {
    const st = get()
    if (!st.available || st[kind].has(key)) return
    const next = new Set(st[kind])
    next.add(key)
    set({ [kind]: next } as Partial<ReadsState>)
    supabase.from('content_reads').upsert({ profile_id: profileId, kind, item_key: key }, { ignoreDuplicates: true })
      .then(({ error }) => { if (error) console.warn('[reads]', error.message) })
  },
}))

/** Wczytaj raz na profil (wołane przez ekrany, które pokazują liczniki). */
export function ensureReads(profileId: string | undefined) {
  if (profileId && useReadsStore.getState().loadedFor !== profileId) useReadsStore.getState().load(profileId)
}

/** Adresaci ogłoszeń widocznych dla profilu (jak w AnnouncementsFeed). null = wszystkie (opiekun). */
export function announcementTargets(profile: Pick<Profile, 'role' | 'rank_id'> | null | undefined): string[] | null {
  if (profile?.role === 'member') return ['all', 'members', ...(profile.rank_id ? [profile.rank_id] : [])]
  if (profile?.role === 'parent') return ['all', 'parents']
  return null
}

/** Id ogłoszeń widocznych dla profilu (do licznika nieprzeczytanych). */
export async function visibleAnnouncementIds(profile: Pick<Profile, 'role' | 'rank_id' | 'parish_id'> | null | undefined): Promise<string[]> {
  if (!profile?.parish_id) return []
  let q = supabase.from('announcements').select('id').eq('parish_id', profile.parish_id)
  const targets = announcementTargets(profile)
  if (targets) q = q.in('target_audience', targets)
  const { data } = await q
  return ((data ?? []) as { id: string }[]).map(a => a.id)
}

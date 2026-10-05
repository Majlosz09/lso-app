import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '../lib/supabase'
import { useTheme } from '../lib/ThemeContext'
import { sans } from '../lib/theme'
import { WIEDZA_DATA } from '../lib/wiedza'
import { AppText, Card, Icon } from './ui'

export type FormationItem = { key: string; label: string; have: number; need: number; met: boolean; unit?: string; categories?: string[] }
export type FormationProgress = {
  current: { id: string; name: string } | null
  next: { id: string; name: string } | null
  items: FormationItem[]
  note?: string | null
  configured: boolean
  ready: boolean
  top?: boolean
}

/** Postęp do następnego stopnia (formation_progress). Bez uprawnień albo bez ścieżki — nic nie pokazuje. */
export function FormationProgressCard({ profileId, who = 'me', bare }: { profileId: string; who?: 'me' | 'child' | 'admin'; bare?: boolean }) {
  const { colors: c } = useTheme()
  const router = useRouter()
  const [p, setP] = useState<FormationProgress | null>(null)

  useEffect(() => {
    supabase.rpc('formation_progress', { p_profile: profileId }).then(({ data, error }) => setP(error ? null : (data as FormationProgress)))
  }, [profileId])

  if (!p || (!p.configured && !p.top)) return null
  const catTitle = (id: string) => WIEDZA_DATA.find(x => x.id === id)?.title ?? id

  const body = p.top ? (
    <View style={styles.row}>
      <Icon name="crown" size={20} color={c.goldInk} />
      <AppText variant="bodyStrong" style={styles.flex}>{`${p.current?.name ?? 'Najwyższy stopień'} — najwyższy stopień w parafii`}</AppText>
    </View>
  ) : (
    <>
      <View style={styles.row}>
        <AppText variant="eyebrow" color={c.goldInk} style={styles.flex}>{`Do stopnia: ${p.next?.name}`}</AppText>
        {p.ready && <Icon name="check-decagram" size={20} color={c.success} filled />}
      </View>
      {p.items.map(it => {
        const pct = Math.min(100, it.need ? Math.round((it.have / it.need) * 100) : 100)
        return (
          <View key={it.key} style={styles.item}>
            <View style={styles.row}>
              <Icon name={it.met ? 'check-circle' : 'circle-outline'} size={18} color={it.met ? c.success : c.iconMuted} filled={it.met} />
              <AppText variant="body" style={styles.flex}>{it.label}</AppText>
              <AppText style={[styles.count, { color: it.met ? c.success : c.text }]}>{`${it.have}${it.unit ?? ''} / ${it.need}${it.unit ?? ''}`}</AppText>
            </View>
            <View style={[styles.track, { backgroundColor: c.borderLight }]}>
              <View style={[styles.fill, { width: `${pct}%`, backgroundColor: it.met ? c.success : c.gold }]} />
            </View>
            {it.key === 'wiedza' && !!it.categories?.length && (
              <Pressable onPress={() => router.push('/(tabs)/wiedza' as any)} disabled={who !== 'me'}>
                <AppText variant="small" color={who === 'me' ? c.primary : c.subtext}>
                  {`Działy: ${it.categories.map(catTitle).join(', ')}${who === 'me' ? ' →' : ''}`}
                </AppText>
              </Pressable>
            )}
          </View>
        )
      })}
      {!!p.note && (
        <View style={[styles.note, { backgroundColor: c.goldSurface }]}>
          <Icon name="information" size={16} color={c.goldInk} />
          <AppText variant="small" style={[styles.flex, { color: c.goldText }]}>{p.note}</AppText>
        </View>
      )}
      {p.ready && (
        <AppText variant="small" color={c.success}>
          {who === 'admin' ? 'Spełnia wymagania — możesz nadać nowy stopień.' : 'Wszystko spełnione — opiekun może nadać nowy stopień.'}
        </AppText>
      )}
    </>
  )
  return bare ? <View style={styles.wrap}>{body}</View> : <Card style={styles.wrap}>{body}</Card>
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  item: { gap: 5 },
  count: { ...sans(800), fontSize: 13 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  note: { flexDirection: 'row', gap: 8, padding: 10, borderRadius: 10, alignItems: 'flex-start' },
})

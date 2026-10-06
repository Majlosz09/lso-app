import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useTheme } from '../lib/ThemeContext'
import { sans } from '../lib/theme'
import { localDateStr, shortDate } from '../lib/dates'
import { BoardRow, Challenge, challengeStatus } from '../lib/challenges'
import { useRealtimeTable } from '../hooks/useRealtimeTable'
import { AppText, Card, Icon } from './ui'

type Item = { c: Challenge; board: BoardRow[] }

/** Trwające (i najbliższe) wyzwania parafii: mój postęp, premia, czołówka. */
export function ChallengeCards({ max = 2 }: { max?: number }) {
  const { colors: c } = useTheme()
  const parishId = useAuthStore(s => s.profile?.parish_id)
  const me = useAuthStore(s => s.profile?.id)
  const [items, setItems] = useState<Item[]>([])
  const today = localDateStr()

  const load = async () => {
    if (!parishId) return
    const { data, error } = await supabase.from('challenges').select('*').eq('parish_id', parishId)
      .gte('date_to', today).order('date_from').limit(max)
    if (error) return
    const list = (data ?? []) as Challenge[]
    const boards = await Promise.all(list.map(ch => supabase.rpc('challenge_board', { p_challenge: ch.id })))
    setItems(list.map((ch, i) => ({ c: ch, board: ((boards[i].data ?? []) as BoardRow[]) })))
  }
  useEffect(() => { load() }, [parishId])
  useRealtimeTable('attendance', () => { load() })

  if (!items.length) return null
  return (
    <>
      {items.map(({ c: ch, board }) => {
        const status = challengeStatus(ch, today)
        const mine = board.find(b => b.id === me)
        const have = mine?.count ?? 0
        const pct = Math.min(100, Math.round((have / ch.goal) * 100))
        const top = board.slice(0, 3)
        return (
          <Card key={ch.id} style={styles.card}>
            <View style={styles.row}>
              <View style={[styles.icon, { backgroundColor: c.goldSurface }]}><Icon name={ch.icon || 'trophy'} size={20} color={c.goldInk} /></View>
              <View style={styles.flex}>
                <AppText variant="eyebrow" color={c.goldInk}>{status === 'upcoming' ? `Wyzwanie od ${shortDate(ch.date_from)}` : 'Wyzwanie'}</AppText>
                <AppText variant="bodyStrong">{ch.name}</AppText>
              </View>
              {ch.bonus_points > 0 && <AppText style={[styles.bonus, { color: c.goldInk }]}>{`+${ch.bonus_points} pkt`}</AppText>}
            </View>
            {!!ch.description && <AppText variant="small" muted>{ch.description}</AppText>}
            {status === 'active' && (
              <>
                <View style={styles.row}>
                  <AppText variant="small" style={styles.flex}>{mine?.done ? 'Ukończone — brawo!' : `Twój wynik: ${have} z ${ch.goal}`}</AppText>
                  <AppText variant="small" muted>{`do ${shortDate(ch.date_to)}`}</AppText>
                </View>
                <View style={[styles.track, { backgroundColor: c.borderLight }]}>
                  <View style={[styles.fill, { width: `${pct}%`, backgroundColor: mine?.done ? c.success : c.gold }]} />
                </View>
                {top.length > 0 && (
                  <AppText variant="small" muted numberOfLines={1}>
                    {'Najlepsi: ' + top.map((b, i) => `${i + 1}. ${b.name.split(' ')[0]} ${b.count}${b.done ? ' ✓' : ''}`).join('  ·  ')}
                  </AppText>
                )}
              </>
            )}
          </Card>
        )
      })}
    </>
  )
}

const styles = StyleSheet.create({
  card: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flex: { flex: 1, minWidth: 0 },
  icon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  bonus: { ...sans(800), fontSize: 14 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
})

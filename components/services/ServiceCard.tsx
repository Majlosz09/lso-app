import { Pressable, StyleSheet, View } from 'react-native'
import { useTheme } from '../../lib/ThemeContext'
import { sans } from '../../lib/theme'
import { shadow } from '../../lib/shadows'
import { pl } from '../../lib/dates'
import { CATEGORY_CONFIG } from '../../types/database'
import { STATUS_LABELS } from '../../lib/status'
import { Service, staffing } from '../../hooks/useServices'
import { AppText, Badge, Icon } from '../ui'

/** Tekst obsady: „Bez obsady” / „1 ministrant” / „3 ministrantów”, dla wolnego miejsca „wolne miejsce”. */
export function staffingLabel(s: Service): { text: string; tone: 'success' | 'danger' | 'gold' } {
  if (s.isTemplate) return { text: 'wolne miejsce', tone: 'gold' }
  const { count } = staffing(s)
  if (count === 0) return { text: 'bez obsady', tone: 'danger' }
  return { text: `${count} ${pl(count, ['ministrant', 'ministrantów', 'ministrantów'])}`, tone: 'success' }
}

/** Karta służby w grafiku: godzina, tytuł, obsada, „TY”; opcjonalnie lista obsady. */
export function ServiceCard({ service: s, onPress, showPeople, selected }: {
  service: Service
  onPress?: () => void
  showPeople?: boolean
  /** web: wybrana w liście (złoty pasek z lewej) */
  selected?: boolean
}) {
  const { colors: c } = useTheme()
  const st = staffingLabel(s)
  const toneColor = { success: c.success, danger: c.dangerStrong, gold: c.goldInk }[st.tone]
  const isMine = !!s.mine
  const cat = CATEGORY_CONFIG[s.category] ?? CATEGORY_CONFIG.msza
  const statusNote = s.attended
    ? 'obecność potwierdzona'
    : s.mine && s.mine.status !== 'assigned' ? STATUS_LABELS[s.mine.status]?.toLowerCase() : null

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ hovered }: any) => [
        styles.card,
        { backgroundColor: selected || hovered ? c.highlight : c.surface, borderColor: isMine ? c.primary : c.border },
        isMine && shadow.featured,
      ]}
    >
      {selected && <View style={[styles.selBar, { backgroundColor: c.gold }]} />}
      <View style={styles.top}>
        <AppText style={[styles.time, { color: c.text }]}>{s.time}</AppText>
        <View style={[styles.catLine, { backgroundColor: cat.color }]} />
        <View style={styles.flex}>
          <AppText variant="bodyStrong" numberOfLines={1}>{s.title}</AppText>
          {!!s.churchName && (
            <View style={styles.church}>
              <Icon name="church" size={13} color={c.goldInk} />
              <AppText variant="small" color={c.goldInk} numberOfLines={1}>{s.churchName}</AppText>
            </View>
          )}
          <AppText style={[styles.sub, { color: statusNote ? c.subtext : toneColor }]} numberOfLines={1}>
            {statusNote ?? st.text}
          </AppText>
        </View>
        {s.attended && <Icon name="check-circle" size={20} color={c.success} filled />}
        {isMine && !s.attended && <Badge label="TY" tone="navy" style={styles.ty} />}
        <Icon name="chevron-right" size={22} color={c.iconMuted} />
      </View>
      {showPeople && s.people.length > 0 && (
        <View style={[styles.people, { borderTopColor: c.borderLight }]}>
          {s.people.map(p => (
            <View key={p.profileId} style={styles.person}>
              <AppText variant="small" muted style={styles.role}>Ministrant</AppText>
              <AppText style={[styles.personName, { color: p.isMe ? c.primary : c.text }]} numberOfLines={1}>
                {p.isMe ? 'Ty' : p.name}
              </AppText>
            </View>
          ))}
        </View>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  church: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  card: { borderWidth: 1, borderRadius: 16, overflow: 'hidden', cursor: 'pointer' } as any,
  selBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  time: { ...sans(800), fontSize: 16, minWidth: 48, flexShrink: 0, fontVariant: ['tabular-nums'] },
  catLine: { width: 3, alignSelf: 'stretch', borderRadius: 2 },
  flex: { flex: 1, minWidth: 0 },
  sub: { ...sans(600), fontSize: 12, marginTop: 1 },
  ty: { paddingHorizontal: 7 },
  people: { borderTopWidth: 1, paddingHorizontal: 14, paddingVertical: 8, gap: 2 },
  person: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
  role: { width: 110 },
  personName: { ...sans(700), fontSize: 14, flex: 1 },
})

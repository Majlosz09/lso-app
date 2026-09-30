import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../lib/ThemeContext'
import { headerPalette, sans, serif, VESTMENT_NAMES, VestmentColor } from '../../lib/theme'
import { getLiturgicalDay } from '../../lib/liturgy'
import { longDateCap } from '../../lib/dates'
import { serviceAvailability } from '../../lib/serviceRules'
import { STATUS_LABELS } from '../../lib/status'
import { CATEGORY_CONFIG } from '../../types/database'
import { Service } from '../../hooks/useServices'
import { AppText, Button, Card, Icon } from '../ui'
import { staffingLabel } from './ServiceCard'

type Actions = {
  checkIn: (s: Service) => void
  openSignUp: (s: Service) => void
  openUnsign: (s: Service) => void
  openAbsence: (s: Service) => void
  openSwap?: (s: Service) => void
  pendingSwap?: (s: Service) => { toName: string } | null
  cancelSwap?: (s: Service) => void
  busyId: string | null
  mode: string
}

/** Punkty z reguł parafii za tę służbę (Msza z przydziałem / dodatkowa, nabożeństwo, zbiórka). */
function usePointsFor(s: Service | null): number | null {
  const parishId = useAuthStore(st => st.profile?.parish_id)
  const [pts, setPts] = useState<number | null>(null)
  const type = !s ? null : s.category === 'msza' ? (s.mine ? 'msza_assigned' : 'msza_extra') : s.category
  useEffect(() => {
    if (!type || !parishId) return
    supabase.from('point_rules').select('points').eq('parish_id', parishId).eq('service_type', type).maybeSingle()
      .then(({ data }) => setPts(data?.points ?? null))
  }, [type, parishId])
  return pts
}

/**
 * Szczegóły służby: nagłówek w kolorze szat dnia, obsada, uwagi, punkty i akcje.
 * Na telefonie jako ekran, na webie jako panel obok listy grafiku.
 */
export function ServiceDetail({ service: s, actions, compactHeader }: {
  service: Service
  actions: Actions
  /** bez safe-area (panel na webie) */
  compactHeader?: boolean
}) {
  const { colors: c, isDark } = useTheme()
  const lit = getLiturgicalDay(s.date)
  const color = (lit.color ?? 'GREEN') as VestmentColor
  const pal = headerPalette(color, isDark)
  const avail = serviceAvailability(s, actions.mode)
  const st = staffingLabel(s)
  const pts = usePointsFor(s)
  const busy = actions.busyId === s.id
  const swap = actions.pendingSwap?.(s) ?? null
  const cat = CATEGORY_CONFIG[s.category] ?? CATEGORY_CONFIG.msza

  return (
    <View style={styles.root}>
      <View style={[styles.head, { backgroundColor: pal.bg, paddingTop: compactHeader ? 20 : 20 }]}>
        <AppText variant="eyebrow" color={pal.accent}>{`${cat.label} · ${VESTMENT_NAMES[color]}`}</AppText>
        <AppText style={[serif(), styles.title, { color: pal.fg }]}>{s.title}</AppText>
        <AppText style={[styles.when, { color: pal.fg }]}>{`${longDateCap(s.date)} · ${s.time}`}</AppText>
        <AppText style={[styles.lit, { color: pal.fg }]} numberOfLines={2}>{lit.name}</AppText>
      </View>

      <View style={styles.body}>
        <Card flush>
          <View style={[styles.sectionHead, { borderBottomColor: c.borderLight }]}>
            <AppText variant="eyebrow" color={c.goldInk}>Obsada</AppText>
            <AppText style={[styles.staffing, { color: { success: c.success, danger: c.dangerStrong, gold: c.goldInk }[st.tone] }]}>
              {st.text}
            </AppText>
          </View>
          {s.people.length === 0 ? (
            <AppText muted style={styles.empty}>
              {s.isTemplate ? 'Nikt jeszcze się nie zapisał — możesz być pierwszy.' : 'Nikt nie jest przypisany do tej służby.'}
            </AppText>
          ) : s.people.map((p, i) => (
            <View key={p.profileId} style={[styles.person, i > 0 && { borderTopWidth: 1, borderTopColor: c.borderLight }]}>
              <AppText variant="small" muted>Ministrant</AppText>
              <View style={styles.personRow}>
                <AppText style={[styles.personName, { color: p.isMe ? c.primary : c.text }]}>{p.isMe ? 'Ty' : p.name}</AppText>
                {p.status !== 'assigned' && (
                  <AppText variant="small" muted>{STATUS_LABELS[p.status]?.toLowerCase()}</AppText>
                )}
              </View>
            </View>
          ))}
        </Card>

        {!!s.notes && (
          <View style={[styles.note, { backgroundColor: c.goldSurface }]}>
            <Icon name="information" size={20} color={c.goldInk} />
            <AppText style={[styles.noteText, { color: c.goldText }]}>{s.notes}</AppText>
          </View>
        )}

        {!!s.mine?.admin_note && (
          <View style={[styles.note, { backgroundColor: c.dangerSurface }]}>
            <Icon name="alert-circle" size={20} color={c.danger} />
            <AppText style={[styles.noteText, { color: c.danger }]}>{s.mine.admin_note}</AppText>
          </View>
        )}
        {!!s.mine?.absence_reason && s.mine.status === 'excused' && (
          <View style={[styles.note, { backgroundColor: c.borderLight }]}>
            <Icon name="calendar-remove" size={20} color={c.subtext} />
            <AppText style={[styles.noteText, { color: c.subtext }]}>
              Zgłoszona nieobecność: {s.mine.absence_reason} — czeka na decyzję opiekuna.
            </AppText>
          </View>
        )}

        <View style={styles.tiles}>
          <Card style={styles.tile}>
            <AppText style={[styles.tileBig, { color: c.text }]}>{pts != null ? `+${pts} pkt` : '—'}</AppText>
            <AppText variant="small" muted>za obecność</AppText>
          </Card>
          <Card style={styles.tile}>
            <AppText style={[styles.tileBig, { color: c.text, fontSize: 15 }]}>
              {s.attended ? 'Obecny' : s.mine ? STATUS_LABELS[s.mine.status] : 'Nie jesteś zapisany'}
            </AppText>
            <AppText variant="small" muted>Twój status</AppText>
          </Card>
        </View>

        {!!swap && (
          <View style={[styles.note, { backgroundColor: c.goldSurface }]}>
            <Icon name="swap-horizontal" size={20} color={c.goldText} />
            <View style={styles.flex}>
              <AppText style={[styles.noteText, { color: c.goldText }]}>{`Prośba o zamianę · czeka na odpowiedź: ${swap.toName}`}</AppText>
              <Button label="Wycofaj prośbę" variant="ghost" compact style={styles.selfStart} onPress={() => actions.cancelSwap?.(s)} loading={busy} />
            </View>
          </View>
        )}

        {avail.adminMarks && (
          <View style={[styles.note, { backgroundColor: c.borderLight }]}>
            <Icon name="shield-check" size={20} color={c.subtext} />
            <AppText style={[styles.noteText, { color: c.subtext }]}>W tej parafii obecność zaznacza opiekun.</AppText>
          </View>
        )}

        <View style={styles.actions}>
          {avail.canCheckIn && (
            <Button label="Potwierdź obecność" icon="account-check" onPress={() => actions.checkIn(s)} loading={busy} />
          )}
          {avail.canSignUp && (
            <Button label="Zapisz się" icon="plus" onPress={() => actions.openSignUp(s)} loading={busy} />
          )}
          {avail.canSwap && !swap && actions.openSwap && (
            <Button label="Poproś o zamianę" icon="swap-horizontal" variant="secondary" onPress={() => actions.openSwap!(s)} />
          )}
          <View style={styles.row}>
            {avail.canReportAbsence && (
              <Button label="Nie mogę być" icon="calendar-remove" variant="secondary" style={styles.flex} onPress={() => actions.openAbsence(s)} />
            )}
            {avail.canUnsign && (
              <Button label="Wypisz się" icon="logout" variant="secondary" style={styles.flex} onPress={() => actions.openUnsign(s)} />
            )}
          </View>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: 0 },
  head: { paddingHorizontal: 22, paddingBottom: 22, gap: 6 },
  title: { fontSize: 34, lineHeight: 37 },
  when: { ...sans(700), fontSize: 14 },
  lit: { ...sans(500), fontSize: 13, opacity: 0.9 },
  body: { padding: 16, gap: 12 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1 },
  staffing: { ...sans(700), fontSize: 12 },
  empty: { padding: 14 },
  person: { paddingHorizontal: 14, paddingVertical: 10, gap: 2 },
  personRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  personName: { ...sans(700), fontSize: 15 },
  note: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 14, alignItems: 'flex-start' },
  noteText: { ...sans(500), fontSize: 13, lineHeight: 19, flex: 1 },
  tiles: { flexDirection: 'row', gap: 10 },
  tile: { flex: 1, gap: 2 },
  tileBig: { ...sans(800), fontSize: 18 },
  actions: { gap: 10 },
  row: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
  selfStart: { alignSelf: 'flex-start', marginLeft: -12 },
})

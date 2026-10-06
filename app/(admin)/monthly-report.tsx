import { useEffect, useState } from 'react'
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import * as Print from 'expo-print'
import Toast from 'react-native-toast-message'
import { supabase } from '../../lib/supabase'
import { useTheme } from '../../lib/ThemeContext'
import { sans } from '../../lib/theme'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import { MonthlyReport, delta, monthTitle, monthlyReportHtml, staffedPct } from '../../lib/monthlyReport'
import { shareFile } from '../../lib/export'
import { AppText, Button, Card, Icon } from '../../components/ui'

const CAT: Record<string, string> = { msza: 'Msze', nabozenstwo: 'Nabożeństwa', zbiorka: 'Zbiórki' }
const firstOfMonth = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
const shiftMonth = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00'); d.setMonth(d.getMonth() + n); return firstOfMonth(d) }
const dm = (d: string) => `${Number(d.slice(8, 10))}.${d.slice(5, 7)}`

/** Miesięczny raport dla proboszcza: liczby, najwierniejsi, kto znika, braki obsady, awanse, wyzwania. */
export default function MonthlyReportScreen() {
  const router = useRouter()
  const isDesktop = useIsDesktop()
  const { colors: c } = useTheme()
  const params = useLocalSearchParams<{ month?: string }>()
  // domyślnie poprzedni miesiąc (raport „za wrzesień” czyta się w październiku)
  const [month, setMonth] = useState(params.month?.slice(0, 7) ? `${params.month.slice(0, 7)}-01` : shiftMonth(firstOfMonth(new Date()), -1))
  const [rep, setRep] = useState<MonthlyReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const isFuture = month > firstOfMonth(new Date())

  useEffect(() => {
    setRep(null); setError(null)
    supabase.rpc('monthly_report', { p_month: month }).then(({ data, error: e }) => {
      if (e) setError(e.message); else setRep(data as MonthlyReport)
    })
  }, [month])

  const print = async () => {
    if (!rep) return
    const html = monthlyReportHtml(rep)
    if (Platform.OS === 'web') {
      const w = window.open('', '_blank')
      if (!w) { Toast.show({ type: 'error', text1: 'Przeglądarka zablokowała okno' }); return }
      w.document.write(html); w.document.close(); w.focus(); w.print()
    } else {
      const { uri } = await Print.printToFileAsync({ html })
      await shareFile(uri)
    }
  }

  const tile = (value: string, label: string, d?: string | null, good?: boolean) => (
    <Card style={styles.tile}>
      <AppText style={[styles.big, { color: c.text }]}>{value}</AppText>
      <AppText variant="small" muted>{label}</AppText>
      {!!d && <AppText variant="small" color={good === undefined ? c.goldInk : good ? c.success : c.dangerStrong}>{d}</AppText>}
    </Card>
  )

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={[styles.body, isDesktop && styles.desktop]}>
      <View style={styles.nav}>
        <Pressable accessibilityLabel="Poprzedni miesiąc" onPress={() => setMonth(m => shiftMonth(m, -1))} style={[styles.navBtn, { backgroundColor: c.surface }]}>
          <Icon name="chevron-left" size={22} color={c.primary} />
        </Pressable>
        <AppText variant="heading" style={styles.month}>{monthTitle(month)}</AppText>
        <Pressable accessibilityLabel="Następny miesiąc" disabled={isFuture} onPress={() => setMonth(m => shiftMonth(m, 1))}
          style={[styles.navBtn, { backgroundColor: c.surface, opacity: isFuture ? 0.4 : 1 }]}>
          <Icon name="chevron-right" size={22} color={c.primary} />
        </Pressable>
      </View>

      {error ? <Card><AppText color={c.dangerStrong}>{error}</AppText></Card> : !rep ? <ActivityIndicator color={c.primary} /> : (
        <>
          <View style={styles.tiles}>
            {tile(String(rep.stats.attendance), 'obecności', delta(rep.stats.attendance, rep.prev.attendance), rep.stats.attendance >= rep.prev.attendance)}
            {tile(rep.stats.rate >= 0 ? `${rep.stats.rate}%` : '—', 'frekwencja', delta(rep.stats.rate, rep.prev.rate, ' pp'), rep.stats.rate >= rep.prev.rate)}
            {tile(`${staffedPct(rep)}%`, `obsadzonych (${rep.stats.staffed}/${rep.stats.services})`)}
            {tile(`${rep.stats.active_members}/${rep.stats.members}`, 'ministrantów służyło', delta(rep.stats.active_members, rep.prev.active_members), rep.stats.active_members >= rep.prev.active_members)}
          </View>

          <View style={[styles.cols, isDesktop && styles.colsDesk]}>
            <View style={styles.col}>
              <Card style={styles.card}>
                <AppText variant="eyebrow" color={c.goldInk}>Najwierniejsi</AppText>
                {rep.top.length === 0 ? <AppText muted>Brak obecności w tym miesiącu.</AppText> : rep.top.map((t, i) => (
                  <View key={t.name} style={styles.line}>
                    <AppText variant="bodyStrong" style={styles.pos}>{`${i + 1}.`}</AppText>
                    <AppText style={styles.flex}>{t.name}</AppText>
                    <AppText variant="small" muted>{`${t.cnt} służb · ${t.pts} pkt`}</AppText>
                  </View>
                ))}
              </Card>
              <Card style={styles.card}>
                <AppText variant="eyebrow" color={c.dangerStrong}>Do zauważenia</AppText>
                <AppText variant="small" muted>Służyli w poprzednich dwóch miesiącach, w tym — ani razu. Może warto zadzwonić?</AppText>
                {rep.fading.length === 0 ? <AppText muted>Nikt nie zniknął — świetnie!</AppText> : rep.fading.map(f => (
                  <Pressable key={f.id} onPress={() => router.push(`/(admin)/member-detail?id=${f.id}` as any)} style={styles.line}>
                    <Icon name="account-alert" size={18} color={c.dangerStrong} />
                    <AppText style={styles.flex}>{f.name}</AppText>
                    <AppText variant="small" muted>{f.last ? `ostatnio ${dm(f.last)}` : ''}</AppText>
                    <Icon name="chevron-right" size={18} color={c.iconMuted} />
                  </Pressable>
                ))}
              </Card>
            </View>
            <View style={styles.col}>
              <Card style={styles.card}>
                <AppText variant="eyebrow" color={c.goldInk}>Służby bez obsady</AppText>
                {rep.unstaffed.length === 0 ? <AppText muted>Wszystkie służby miały obsadę.</AppText> : rep.unstaffed.map((u, i) => (
                  <AppText key={i} variant="small">{`${dm(u.date)} ${u.time} — ${u.title}`}</AppText>
                ))}
              </Card>
              <Card style={styles.card}>
                <AppText variant="eyebrow" color={c.goldInk}>W skrócie</AppText>
                <AppText variant="small">{Object.entries(rep.by_category).map(([k, v]) => `${CAT[k] ?? k}: ${v}`).join(' · ') || 'Brak obecności'}</AppText>
                <AppText variant="small">{`Nowi ministranci: ${rep.stats.new_members} · przyznane punkty: ${rep.stats.points}`}</AppText>
                <AppText variant="small">{`Usprawiedliwione: ${rep.absences.accepted} · nieusprawiedliwione: ${rep.absences.absent} · obecności ze zgłoszeń: ${rep.absences.reports}`}</AppText>
                {rep.promotions.length > 0 && <AppText variant="small">{`Awanse: ${rep.promotions.map(p => `${p.name} → ${p.rank}`).join(', ')}`}</AppText>}
                {rep.challenges.length > 0 && <AppText variant="small">{`Wyzwania: ${rep.challenges.map(ch => `${ch.name} (ukończyło ${ch.done})`).join(', ')}`}</AppText>}
              </Card>
            </View>
          </View>
          <Button label={Platform.OS === 'web' ? 'Drukuj / zapisz PDF' : 'Zapisz PDF'} icon="printer" onPress={print} />
        </>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  body: { padding: 16, gap: 12, paddingBottom: 32 },
  desktop: { padding: 28, paddingHorizontal: 32, maxWidth: 1000, width: '100%' },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  month: { textTransform: 'capitalize' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { flexGrow: 1, flexBasis: 150, gap: 2 },
  big: { ...sans(800), fontSize: 24 },
  cols: { gap: 12 },
  colsDesk: { flexDirection: 'row', alignItems: 'flex-start' },
  col: { flex: 1, gap: 12 },
  card: { gap: 6 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
  pos: { width: 24 },
})

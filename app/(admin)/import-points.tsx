import { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native'
import Toast from 'react-native-toast-message'
import { useRouter } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../lib/ThemeContext'
import { sans } from '../../lib/theme'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import { localDateStr } from '../../lib/dates'
import { type Member, matchMembers, normName, parseDateInput, parsePointsImport } from '../../lib/importPoints'
import { AppText, Badge, Button, Card, Sheet, TextField } from '../../components/ui'
import { KeyboardScrollView } from '../../components/ui/KeyboardScrollView'

const EXAMPLE = 'Imię i nazwisko\tPunkty\nJan Kowalski\t120\nAntek Nowak\t85'
const DEFAULT_REASON = 'Punkty sprzed aplikacji'
const plDate = (iso: string) => iso.split('-').reverse().join('.')

/**
 * Import punktów z poprzednich okresów (np. zbieranych na kartce przed aplikacją):
 * wklej z Excela imię i nazwisko + punkty, sprawdź dopasowanie i dopisz jednym ruchem.
 * Każda osoba dostaje jeden wpis „manual” z wybraną datą — liczy się do rankingu jak ręczne punkty.
 */
export default function ImportPointsScreen() {
  const router = useRouter()
  const isDesktop = useIsDesktop()
  const { colors: c } = useTheme()
  const admin = useAuthStore(s => s.profile)
  const [members, setMembers] = useState<Member[]>([])
  const [text, setText] = useState('')
  const [reason, setReason] = useState(DEFAULT_REASON)
  const [dateText, setDateText] = useState(plDate(localDateStr()))
  // ręcznie wskazane osoby dla wierszy, których nie udało się dopasować (klucz: nr wiersza)
  const [manual, setManual] = useState<Record<number, Member>>({})
  const [picking, setPicking] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!admin?.parish_id) return
    supabase.from('profiles').select('id, full_name')
      .eq('parish_id', admin.parish_id).eq('role', 'member').eq('is_active', true).order('full_name')
      .then(({ data }) => setMembers((data ?? []) as Member[]))
  }, [admin?.parish_id])

  const parsed = useMemo(() => parsePointsImport(text), [text])
  const rows = useMemo(
    () => matchMembers(parsed.rows, members).map(r => ({ ...r, member: r.member ?? manual[r.line] ?? null })),
    [parsed.rows, members, manual],
  )
  const ready = rows.filter(r => r.member)
  const missing = rows.filter(r => !r.member)
  const total = ready.reduce((s, r) => s + r.amount, 0)
  const dateIso = parseDateInput(dateText)
  const dateError = !dateIso ? 'Wpisz datę jak 30.09.2026' : dateIso > localDateStr() ? 'Data nie może być w przyszłości' : null
  const dupMembers = new Set(ready.map(r => r.member!.id).filter((id, i, a) => a.indexOf(id) !== i))

  const run = async () => {
    if (!ready.length || dateError || !admin?.parish_id) return
    setBusy(true)
    const [y, m, d] = dateIso!.split('-').map(Number)
    const createdAt = new Date(y, m - 1, d, 12).toISOString()
    const { error } = await supabase.from('points').insert(ready.map(r => ({
      profile_id: r.member!.id,
      amount: r.amount,
      reason: (r.reason ?? reason.trim()) || DEFAULT_REASON,
      awarded_by: admin.id,
      parish_id: admin.parish_id,
      source: 'manual',
      created_at: createdAt,
    })))
    setBusy(false)
    setConfirm(false)
    if (error) { Toast.show({ type: 'error', text1: 'Nie dopisano punktów', text2: error.message }); return }
    Toast.show({ type: 'success', text1: `Dopisano punkty dla ${ready.length} osób`, text2: `Razem ${total > 0 ? '+' : ''}${total} pkt` })
    setText(''); setManual({})
    router.back()
  }

  const pickList = members.filter(m => normName(m.full_name).includes(normName(search)))

  return (
    <KeyboardScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={[styles.body, isDesktop && styles.desktop]} keyboardShouldPersistTaps="handled">
      <Card large style={styles.card}>
        <AppText variant="eyebrow" color={c.goldInk}>Punkty z poprzednich okresów</AppText>
        <AppText variant="small" muted>
          Skopiuj z Excela (albo Arkuszy Google) dwie kolumny: imię i nazwisko oraz liczbę punktów i wklej poniżej.
          Możesz też pisać ręcznie, jedna osoba w linii, np. „Jan Kowalski 120”. Trzecia kolumna (opcjonalna) to powód.
        </AppText>
        <TextInput
          value={text}
          onChangeText={t => { setText(t); setManual({}) }}
          multiline
          placeholder={'np.\nJan Kowalski\t120\nAntek Nowak\t85'}
          placeholderTextColor={c.textTertiary}
          style={[styles.area, { color: c.text, backgroundColor: c.inputBg, borderColor: c.inputBorder }]}
        />
        {!text && <Button compact variant="ghost" label="Wstaw przykład" icon="table" onPress={() => setText(EXAMPLE)} />}
        <View style={styles.row}>
          <TextField label="Powód (widoczny w historii)" value={reason} onChangeText={setReason} containerStyle={styles.flex} />
          <TextField label="Data wpisu" value={dateText} onChangeText={setDateText} containerStyle={styles.date}
            keyboardType="numbers-and-punctuation" hint={dateError ?? undefined} hintTone="danger" />
        </View>
        <AppText variant="small" muted>
          Data decyduje, w którym miesiącu wpis pokaże się w historii i raportach — np. ostatni dzień przed startem aplikacji.
        </AppText>
      </Card>

      {rows.length > 0 && (
        <Card style={styles.card}>
          <AppText variant="eyebrow" color={c.goldInk}>
            {`Podgląd · ${ready.length} ${ready.length === 1 ? 'osoba' : 'osób'} · razem ${total} pkt`}
          </AppText>
          {rows.map((r, i) => (
            <View key={r.line} style={[styles.res, i > 0 && { borderTopWidth: 1, borderTopColor: c.borderLight }]}>
              <View style={styles.flex}>
                <AppText variant="bodyStrong" numberOfLines={1}>{r.member?.full_name ?? r.name}</AppText>
                <AppText variant="small" muted numberOfLines={1}>
                  {r.member
                    ? [manual[r.line] && `z listy: „${r.name}”`, r.reason, dupMembers.has(r.member.id) && 'kilka wierszy dla tej osoby'].filter(Boolean).join(' · ') || ' '
                    : 'Nie ma takiej osoby w parafii'}
                </AppText>
              </View>
              {r.member
                ? <AppText style={[styles.amt, { color: r.amount < 0 ? c.dangerStrong : c.primary }]}>{`${r.amount > 0 ? '+' : ''}${r.amount}`}</AppText>
                : <Button compact variant="secondary" label="Wybierz" onPress={() => { setSearch(''); setPicking(r.line) }} />}
            </View>
          ))}
        </Card>
      )}
      {(parsed.errors.length > 0 || missing.length > 0) && (
        <Card style={styles.card}>
          <AppText variant="eyebrow" color={c.dangerStrong}>Do poprawki</AppText>
          {missing.length > 0 && (
            <AppText variant="small" color={c.dangerStrong}>
              {`Nie rozpoznano: ${missing.length} — wskaż osobę przyciskiem „Wybierz” albo popraw imię. Inaczej wiersz zostanie pominięty.`}
            </AppText>
          )}
          {parsed.errors.map(e => <AppText key={e} variant="small" color={c.dangerStrong}>{e}</AppText>)}
        </Card>
      )}
      <Button label={ready.length ? `Dopisz punkty dla ${ready.length} osób` : 'Dopisz punkty'} icon="star-circle"
        disabled={!ready.length || !!dateError} onPress={() => setConfirm(true)} />

      <Sheet visible={picking !== null} onClose={() => setPicking(null)} title="Kto to jest?"
        eyebrow={rows.find(r => r.line === picking)?.name}>
        <TextField placeholder="Szukaj po imieniu…" value={search} onChangeText={setSearch} autoFocus />
        <ScrollView style={styles.pick} keyboardShouldPersistTaps="handled">
          {pickList.map(m => (
            <Pressable key={m.id} style={[styles.pickRow, { borderBottomColor: c.borderLight }]}
              onPress={() => { setManual(prev => ({ ...prev, [picking!]: m })); setPicking(null) }}>
              <AppText variant="bodyStrong">{m.full_name}</AppText>
            </Pressable>
          ))}
          {pickList.length === 0 && <AppText muted>Brak osób o tym imieniu.</AppText>}
        </ScrollView>
      </Sheet>

      <Sheet visible={confirm} onClose={() => setConfirm(false)} title="Dopisać punkty?"
        footer={<Button label="Tak, dopisz" icon="check" loading={busy} onPress={run} />}>
        <AppText>
          {`${ready.length} ${ready.length === 1 ? 'osoba dostanie' : 'osób dostanie'} wpis z datą ${dateIso ? plDate(dateIso) : ''}, razem ${total} pkt.`}
        </AppText>
        <AppText variant="small" muted>
          Ministranci (i ich rodzice) zobaczą powiadomienie o punktach. Pomyłkę poprawisz, przyznając tej osobie punkty na minusie.
        </AppText>
        {missing.length > 0 && <Badge label={`${missing.length} nierozpoznanych pominiemy`} tone="muted" />}
      </Sheet>
    </KeyboardScrollView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  body: { padding: 16, gap: 12, paddingBottom: 32 },
  desktop: { padding: 28, paddingHorizontal: 32, maxWidth: 820, width: '100%' },
  card: { gap: 8 },
  area: { ...sans(500), minHeight: 160, borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 14, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  date: { width: 140 },
  res: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  amt: { ...sans(800), fontSize: 16 },
  pick: { maxHeight: 360, marginTop: 8 },
  pickRow: { paddingVertical: 12, borderBottomWidth: 1 },
})

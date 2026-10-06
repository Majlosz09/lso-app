import { useEffect, useMemo, useState } from 'react'
import { Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import * as Print from 'expo-print'
import Toast from 'react-native-toast-message'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../lib/ThemeContext'
import { sans } from '../../lib/theme'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import { claimCardsHtml, parseImport } from '../../lib/importMembers'
import { appWebUrl } from '../../lib/shareLinks'
import { shareFile } from '../../lib/export'
import { AppText, Badge, Button, Card } from '../../components/ui'
import { KeyboardScrollView } from '../../components/ui/KeyboardScrollView'

type Result = { full_name: string; status: 'created' | 'exists' | 'invalid'; claim_code?: string }

const EXAMPLE = 'Imię\tNazwisko\tRocznik\tFunkcje\nJan\tKowalski\t2014\tLektor\nAntek\tNowak\t2016\t'
const fmt = (c: string) => `${c.slice(0, 4)}-${c.slice(4)}`

/**
 * Import ministrantów z Excela: wklej kolumny (imię i nazwisko, rocznik, funkcje, ranga).
 * Każdy od razu jest w grafiku jako ministrant bez konta i dostaje kod osobisty do założenia konta.
 */
export default function ImportMembersScreen() {
  const isDesktop = useIsDesktop()
  const { colors: c } = useTheme()
  const parish = useAuthStore(s => s.parish)
  const [text, setText] = useState('')
  const [existing, setExisting] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<Result[] | null>(null)
  const parsed = useMemo(() => parseImport(text), [text])

  useEffect(() => {
    if (!parish?.id) return
    supabase.from('profiles').select('full_name').eq('parish_id', parish.id)
      .then(({ data }) => setExisting(new Set(((data ?? []) as any[]).map(p => String(p.full_name).toLowerCase()))))
  }, [parish?.id, results])

  const fresh = parsed.rows.filter(r => !existing.has(r.full_name.toLowerCase()))

  const run = async () => {
    if (!fresh.length) return
    setBusy(true)
    const { data, error } = await supabase.rpc('import_members', { p_rows: fresh })
    setBusy(false)
    if (error) { Toast.show({ type: 'error', text1: 'Nie zaimportowano', text2: error.message }); return }
    const res = (data ?? []) as Result[]
    setResults(res)
    setText('')
    Toast.show({ type: 'success', text1: `Dodano ${res.filter(r => r.status === 'created').length} ministrantów` })
  }

  const created = (results ?? []).filter(r => r.status === 'created' && r.claim_code) as Required<Result>[]
  const printCards = async () => {
    const html = claimCardsHtml(parish?.name ?? '', created, appWebUrl().replace(/^https?:\/\//, ''))
    if (Platform.OS === 'web') {
      const w = window.open('', '_blank')
      if (!w) { Toast.show({ type: 'error', text1: 'Przeglądarka zablokowała okno' }); return }
      w.document.write(html); w.document.close(); w.focus(); w.print()
    } else {
      const { uri } = await Print.printToFileAsync({ html })
      await shareFile(uri)
    }
  }
  const copyCodes = async () => {
    await Clipboard.setStringAsync(created.map(r => `${r.full_name}\t${fmt(r.claim_code)}`).join('\n'))
    Toast.show({ type: 'success', text1: 'Skopiowano listę kodów', text2: 'Wklej do Excela albo wiadomości.' })
  }

  return (
    <KeyboardScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={[styles.body, isDesktop && styles.desktop]} keyboardShouldPersistTaps="handled">
      {results ? (
        <Card large style={styles.card}>
          <AppText variant="eyebrow" color={c.goldInk}>Zaimportowano</AppText>
          <AppText variant="small" muted>
            Ministranci są już w grafiku i na tablecie w zakrystii — bez konta. Rozdaj kody osobiste: kto zechce, założy konto
            z kodem i przejmie swoje dyżury i punkty. Rodzic może połączyć dziecko ze swoim kontem przy rejestracji.
          </AppText>
          {results.map((r, i) => (
            <View key={`${r.full_name}-${i}`} style={[styles.res, i > 0 && { borderTopWidth: 1, borderTopColor: c.borderLight }]}>
              <AppText variant="bodyStrong" style={styles.flex}>{r.full_name}</AppText>
              {r.status === 'created'
                ? <AppText style={[styles.code, { color: c.primary }]} selectable>{fmt(r.claim_code!)}</AppText>
                : <Badge label={r.status === 'exists' ? 'już jest' : 'błąd'} tone="muted" />}
            </View>
          ))}
          {created.length > 0 && (
            <View style={styles.row}>
              <Button compact label="Drukuj karteczki z kodami" icon="printer" style={styles.flex} onPress={printCards} />
              <Button compact label="Kopiuj kody" icon="content-copy" variant="secondary" style={styles.flex} onPress={copyCodes} />
            </View>
          )}
          <Button label="Importuj kolejnych" variant="ghost" onPress={() => setResults(null)} />
        </Card>
      ) : (
        <>
          <Card large style={styles.card}>
            <AppText variant="eyebrow" color={c.goldInk}>Lista ministrantów z Excela</AppText>
            <AppText variant="small" muted>
              Zaznacz w Excelu (albo Arkuszach Google) kolumny: imię i nazwisko (razem albo osobno), rocznik, funkcje (po przecinku),
              ranga — skopiuj i wklej poniżej. Nagłówek nie jest wymagany. Możesz też wpisać jedną osobę w linii.
            </AppText>
            <TextInput
              value={text}
              onChangeText={setText}
              multiline
              placeholder={'np.\nJan Kowalski\t2014\tLektor\nAntek Nowak\t2016'}
              placeholderTextColor={c.textTertiary}
              style={[styles.area, { color: c.text, backgroundColor: c.inputBg, borderColor: c.inputBorder }]}
            />
            {!text && <Button compact variant="ghost" label="Wstaw przykład" icon="table" onPress={() => setText(EXAMPLE)} />}
          </Card>

          {parsed.rows.length > 0 && (
            <Card style={styles.card}>
              <AppText variant="eyebrow" color={c.goldInk}>{`Podgląd · ${fresh.length} do dodania`}</AppText>
              {parsed.rows.map((r, i) => {
                const dup = existing.has(r.full_name.toLowerCase())
                return (
                  <View key={`${r.full_name}-${i}`} style={[styles.res, i > 0 && { borderTopWidth: 1, borderTopColor: c.borderLight }, dup && { opacity: 0.5 }]}>
                    <View style={styles.flex}>
                      <AppText variant="bodyStrong">{r.full_name}</AppText>
                      <AppText variant="small" muted>
                        {[r.rocznik, r.functions.join(', '), r.rank].filter(Boolean).join(' · ') || '—'}
                      </AppText>
                    </View>
                    {dup && <Badge label="już jest" tone="muted" />}
                  </View>
                )
              })}
            </Card>
          )}
          {parsed.errors.length > 0 && (
            <Card style={styles.card}>
              <AppText variant="eyebrow" color={c.dangerStrong}>Do poprawki</AppText>
              {parsed.errors.map(e => <AppText key={e} variant="small" color={c.dangerStrong}>{e}</AppText>)}
            </Card>
          )}
          <Button label={fresh.length ? `Dodaj ${fresh.length} ministrantów` : 'Dodaj ministrantów'} icon="account-multiple-plus"
            disabled={!fresh.length} loading={busy} onPress={run} />
        </>
      )}
    </KeyboardScrollView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  body: { padding: 16, gap: 12, paddingBottom: 32 },
  desktop: { padding: 28, paddingHorizontal: 32, maxWidth: 820, width: '100%' },
  card: { gap: 8 },
  area: { ...sans(500), minHeight: 160, borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 14, textAlignVertical: 'top' },
  res: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  code: { ...sans(800), fontSize: 16, letterSpacing: 1.5 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
})

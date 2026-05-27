import { useState, useMemo } from 'react'
import {
  Modal, View, Text, StyleSheet,
  TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native'
import * as FileSystem from 'expo-file-system'
import * as Print from 'expo-print'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useTheme } from '../lib/ThemeContext'
import { Colors } from '../lib/theme'
import { DatePickerModal } from './DatePickerModal'
import { buildExportData, generateCSV, generateHTML, shareFile } from '../lib/export'

type Format = 'csv' | 'pdf'
type PresetPeriod = 7 | 30 | 90 | 365

interface Props {
  visible: boolean
  onClose: () => void
}

function localDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function subtractDays(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return localDateStr(d)
}

const PRESET_LABELS: Record<PresetPeriod, string> = {
  7: '7 dni', 30: '30 dni', 90: '3 mies.', 365: 'Rok',
}

export function ExportModal({ visible, onClose }: Props) {
  const { profile, parish } = useAuthStore()
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])

  const [format, setFormat] = useState<Format>('pdf')
  const [preset, setPreset] = useState<PresetPeriod | 'custom'>(30)
  const [customFrom, setCustomFrom] = useState(() => subtractDays(30))
  const [customTo, setCustomTo] = useState(() => localDateStr(new Date()))
  const [fromPickerVisible, setFromPickerVisible] = useState(false)
  const [toPickerVisible, setToPickerVisible] = useState(false)
  const [loading, setLoading] = useState(false)
  const [dateError, setDateError] = useState('')

  const todayStr = useMemo(() => localDateStr(new Date()), [])

  const getRange = (): { from: string; to: string } => {
    if (preset === 'custom') return { from: customFrom, to: customTo }
    const d = new Date()
    d.setDate(d.getDate() - preset)
    return { from: localDateStr(d), to: todayStr }
  }

  const handleExport = async () => {
    if (preset === 'custom') {
      if (customFrom > customTo) {
        setDateError('Data "od" nie może być późniejsza niż "do".')
        return
      }
      if (customTo > todayStr) {
        setDateError('Data "do" nie może być w przyszłości.')
        return
      }
    }
    setDateError('')
    if (!profile?.parish_id || !parish?.name) {
      Alert.alert('Błąd', 'Brak danych parafii.')
      return
    }

    setLoading(true)
    try {
      const { from, to } = getRange()
      const data = await buildExportData(supabase, profile.parish_id, parish.name, from, to)

      if (format === 'csv') {
        const csv = generateCSV(data)
        const uri = (FileSystem.cacheDirectory ?? '') + `raport-${from}-${to}.csv`
        await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 })
        await shareFile(uri)
      } else {
        const html = generateHTML(data)
        const { uri } = await Print.printToFileAsync({ html })
        await shareFile(uri)
      }
      onClose()
    } catch {
      Alert.alert('Błąd', 'Nie udało się wygenerować raportu.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
          <TouchableOpacity style={styles.sheet} activeOpacity={1}>
            <View style={styles.header}>
              <Text style={styles.title}>Eksportuj raport</Text>
              <TouchableOpacity onPress={onClose} hitSlop={8}>
                <Ionicons name="close" size={24} color={c.subtext} />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Format</Text>
            <View style={styles.chipRow}>
              {(['pdf', 'csv'] as Format[]).map(f => (
                <TouchableOpacity
                  key={f}
                  style={[styles.chip, format === f && styles.chipActive]}
                  onPress={() => setFormat(f)}
                >
                  <Text style={[styles.chipText, format === f && styles.chipTextActive]}>
                    {f === 'pdf' ? 'PDF' : 'CSV / Excel'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Okres</Text>
            <View style={styles.chipRow}>
              {([7, 30, 90, 365] as PresetPeriod[]).map(p => (
                <TouchableOpacity
                  key={p}
                  style={[styles.chip, preset === p && styles.chipActive]}
                  onPress={() => setPreset(p)}
                >
                  <Text style={[styles.chipText, preset === p && styles.chipTextActive]}>
                    {PRESET_LABELS[p]}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.chip, preset === 'custom' && styles.chipActive]}
                onPress={() => setPreset('custom')}
              >
                <Text style={[styles.chipText, preset === 'custom' && styles.chipTextActive]}>
                  Własny
                </Text>
              </TouchableOpacity>
            </View>

            {preset === 'custom' && (
              <View style={styles.dateRow}>
                <TouchableOpacity style={styles.dateBtn} onPress={() => setFromPickerVisible(true)}>
                  <Text style={styles.dateBtnLabel}>Od</Text>
                  <Text style={styles.dateBtnValue}>{customFrom}</Text>
                </TouchableOpacity>
                <Text style={styles.dateSep}>—</Text>
                <TouchableOpacity style={styles.dateBtn} onPress={() => setToPickerVisible(true)}>
                  <Text style={styles.dateBtnLabel}>Do</Text>
                  <Text style={styles.dateBtnValue}>{customTo}</Text>
                </TouchableOpacity>
              </View>
            )}

            {dateError ? <Text style={styles.error}>{dateError}</Text> : null}

            <TouchableOpacity
              style={[styles.exportBtn, loading && styles.exportBtnDisabled]}
              onPress={handleExport}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.exportBtnText}>Eksportuj</Text>
              }
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <DatePickerModal
        visible={fromPickerVisible}
        value={customFrom}
        onConfirm={date => { setCustomFrom(date); setDateError('') }}
        onClose={() => setFromPickerVisible(false)}
        maxDate={todayStr}
      />
      <DatePickerModal
        visible={toPickerVisible}
        value={customTo}
        onConfirm={date => { setCustomTo(date); setDateError('') }}
        onClose={() => setToPickerVisible(false)}
        maxDate={todayStr}
      />
    </>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    overlay: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
      paddingBottom: 32, paddingHorizontal: 20,
    },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingVertical: 20,
    },
    title: { fontSize: 17, fontWeight: '700', color: c.text },
    label: {
      fontSize: 12, fontWeight: '700', color: c.textTertiary,
      textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginTop: 16,
    },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      paddingHorizontal: 14, paddingVertical: 8,
      borderRadius: 20, borderWidth: 1, borderColor: c.border,
      backgroundColor: c.surface,
    },
    chipActive: { backgroundColor: c.primary, borderColor: c.primary },
    chipText: { fontSize: 13, fontWeight: '500', color: c.subtext },
    chipTextActive: { color: '#fff', fontWeight: '600' },
    dateRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
    dateBtn: {
      flex: 1, padding: 12, backgroundColor: c.bg,
      borderRadius: 10, borderWidth: 1, borderColor: c.border,
    },
    dateBtnLabel: { fontSize: 11, color: c.textTertiary, marginBottom: 2 },
    dateBtnValue: { fontSize: 14, fontWeight: '600', color: c.text },
    dateSep: { fontSize: 16, color: c.subtext },
    error: { marginTop: 8, fontSize: 12, color: '#DC2626' },
    exportBtn: {
      marginTop: 24, backgroundColor: c.primary,
      borderRadius: 12, paddingVertical: 14, alignItems: 'center',
    },
    exportBtnDisabled: { opacity: 0.6 },
    exportBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  })
}

import { useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native'
import Toast from 'react-native-toast-message'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../lib/ThemeContext'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import { Church, churchLabel, useChurches } from '../../hooks/useChurches'
import GpsLocationPicker from '../../components/GpsLocationPicker'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { AppText, Badge, Button, Card, Icon, TextField } from '../../components/ui'
import { KeyboardScrollView } from '../../components/ui/KeyboardScrollView'

type Form = { id: string | null; is_main: boolean; name: string; short_name: string; lat: string; lng: string; radius: string }

const toForm = (c: Church | null): Form => c
  ? { id: c.id, is_main: c.is_main, name: c.name, short_name: c.short_name ?? '', lat: c.lat?.toString() ?? '', lng: c.lng?.toString() ?? '', radius: String(c.gps_radius ?? 200) }
  : { id: null, is_main: false, name: '', short_name: '', lat: '', lng: '', radius: '150' }

/** Kościoły i kaplice parafii — każdy ze swoim GPS do potwierdzania obecności i Mszami w rozkładzie. */
export default function ChurchesScreen() {
  const parishId = useAuthStore(s => s.profile?.parish_id)
  const fetchProfile = useAuthStore(s => s.fetchProfile)
  const isDesktop = useIsDesktop()
  const { colors: c } = useTheme()
  const { churches, loading, refresh } = useChurches()
  const [form, setForm] = useState<Form | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const save = async () => {
    if (!form || !parishId) return
    if (!form.name.trim()) { Toast.show({ type: 'error', text1: 'Podaj nazwę' }); return }
    const lat = form.lat.trim() ? Number(form.lat) : null
    const lng = form.lng.trim() ? Number(form.lng) : null
    const radius = Math.round(Number(form.radius) || 150)
    if ((lat === null) !== (lng === null) || (lat !== null && (isNaN(lat) || isNaN(lng!)))) {
      Toast.show({ type: 'error', text1: 'Niepoprawna lokalizacja', text2: 'Wybierz miejsce na mapie albo wpisz obie współrzędne.' }); return
    }
    if (radius < 20 || radius > 5000) { Toast.show({ type: 'error', text1: 'Promień musi mieć 20–5000 m' }); return }
    const row = { name: form.name.trim(), short_name: form.short_name.trim() || null, lat, lng, gps_radius: radius }
    setSaving(true)
    const { error } = form.id
      ? await supabase.from('churches').update(row).eq('id', form.id)
      : await supabase.from('churches').insert({ ...row, parish_id: parishId })
    setSaving(false)
    if (error) { Toast.show({ type: 'error', text1: 'Nie zapisano', text2: error.message }); return }
    Toast.show({ type: 'success', text1: form.id ? 'Zapisano' : 'Dodano kościół' })
    if (form.is_main) fetchProfile?.() // GPS kościoła głównego = GPS parafii
    setForm(null)
    refresh()
  }

  const remove = async () => {
    if (!form?.id) return
    setConfirmDelete(false)
    setSaving(true)
    const { error } = await supabase.rpc('delete_church', { p_id: form.id })
    setSaving(false)
    if (error) { Toast.show({ type: 'error', text1: 'Nie usunięto', text2: error.message }); return }
    Toast.show({ type: 'success', text1: 'Usunięto' })
    setForm(null)
    refresh()
  }

  if (loading) return <View style={[styles.center, { backgroundColor: c.bg }]}><ActivityIndicator color={c.primary} /></View>

  return (
    <KeyboardScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={[styles.body, isDesktop && styles.desktop]} keyboardShouldPersistTaps="handled">
      {form ? (
        <Card large style={styles.card}>
          <AppText variant="eyebrow" color={c.goldInk}>{form.id ? (form.is_main ? 'Kościół parafialny' : 'Edycja') : 'Nowy kościół / kaplica'}</AppText>
          <TextField label="Nazwa" placeholder="np. Kaplica św. Anny w Zalesiu" value={form.name} onChangeText={v => setForm({ ...form, name: v })} />
          <TextField label="Krótka nazwa (w grafiku, opcjonalnie)" placeholder="np. Zalesie" value={form.short_name}
            onChangeText={v => setForm({ ...form, short_name: v })} maxLength={24} />
          <AppText variant="small" muted>Lokalizacja do potwierdzania obecności przez GPS na Mszach w tym miejscu.</AppText>
          <GpsLocationPicker
            lat={form.lat} lng={form.lng} gpsRadius={form.radius}
            onLatChange={v => setForm(f => f && { ...f, lat: v })}
            onLngChange={v => setForm(f => f && { ...f, lng: v })}
            onGpsRadiusChange={v => setForm(f => f && { ...f, radius: v })}
          />
          <Button label="Zapisz" icon="check" onPress={save} loading={saving} />
          {form.id && !form.is_main && <Button label="Usuń" icon="delete" variant="secondary" onPress={() => setConfirmDelete(true)} />}
          <Button label="Anuluj" variant="ghost" onPress={() => setForm(null)} />
        </Card>
      ) : (
        <>
          <AppText variant="small" muted style={styles.intro}>
            Masz filię albo kaplicę? Dodaj ją tutaj — w Rozkładzie Mszy wybierzesz, gdzie jest dana Msza,
            a ministranci potwierdzą obecność GPS-em przy właściwym kościele.
          </AppText>
          {churches.map(ch => (
            <Card key={ch.id} large onPress={() => setForm(toForm(ch))} style={styles.card}>
              <View style={styles.row}>
                <Icon name="church" size={22} color={c.goldInk} />
                <View style={styles.flex}>
                  <AppText variant="bodyStrong">{ch.name}</AppText>
                  <AppText variant="small" muted>
                    {`${ch.short_name ? `w grafiku: ${churchLabel(ch)} · ` : ''}${ch.lat != null ? `GPS ustawiony · promień ${ch.gps_radius} m` : 'brak lokalizacji GPS'}`}
                  </AppText>
                </View>
                {ch.is_main && <Badge label="główny" tone="navy" />}
                <Icon name="chevron-right" size={20} color={c.subtext} />
              </View>
            </Card>
          ))}
          <Button label="Dodaj kościół lub kaplicę" icon="plus" onPress={() => setForm(toForm(null))} />
        </>
      )}
      <ConfirmDialog
        visible={confirmDelete}
        title="Usunąć ten kościół?"
        message="Przyszłe puste służby w tym miejscu znikną, historia obecności przejdzie do kościoła parafialnego. Kościoła z Mszami w rozkładzie nie da się usunąć."
        confirmText="Usuń"
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={remove}
      />
    </KeyboardScrollView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 16, gap: 12, paddingBottom: 32 },
  desktop: { padding: 28, paddingHorizontal: 32, maxWidth: 720, width: '100%' },
  card: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  intro: { paddingHorizontal: 4 },
})

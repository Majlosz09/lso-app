import { useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native'
import Toast from 'react-native-toast-message'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../lib/ThemeContext'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import { ParishFunction, useFunctions } from '../../hooks/useFunctions'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { AppText, Button, Card, Icon, TextField } from '../../components/ui'

type Form = { id: string | null; name: string; description: string }

/** Funkcje liturgiczne parafii (lektor, ceremoniarz…) — lista, którą opiekun dopasowuje do swojej parafii. */
export default function FunctionsScreen() {
  const parishId = useAuthStore(s => s.profile?.parish_id)
  const isDesktop = useIsDesktop()
  const { colors: c } = useTheme()
  const { functions, byProfile, loading, refresh } = useFunctions()
  const [form, setForm] = useState<Form | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const count = (f: ParishFunction) => [...byProfile.values()].filter(s => s.has(f.id)).length

  const save = async () => {
    if (!form || !parishId) return
    if (!form.name.trim()) { Toast.show({ type: 'error', text1: 'Podaj nazwę' }); return }
    const row = { name: form.name.trim().slice(0, 40), description: form.description.trim() || null }
    setSaving(true)
    const { error } = form.id
      ? await supabase.from('parish_functions').update(row).eq('id', form.id)
      : await supabase.from('parish_functions').insert({ ...row, parish_id: parishId, sort_order: functions.length + 1 })
    setSaving(false)
    if (error) { Toast.show({ type: 'error', text1: 'Nie zapisano', text2: /duplicate|unique/i.test(error.message) ? 'Taka funkcja już jest' : error.message }); return }
    setForm(null)
    refresh()
  }

  const remove = async () => {
    if (!form?.id) return
    setConfirmDelete(false)
    const { error } = await supabase.from('parish_functions').delete().eq('id', form.id)
    if (error) { Toast.show({ type: 'error', text1: 'Nie usunięto', text2: error.message }); return }
    setForm(null)
    refresh()
  }

  if (loading) return <View style={[styles.center, { backgroundColor: c.bg }]}><ActivityIndicator color={c.primary} /></View>

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={[styles.body, isDesktop && styles.desktop]} keyboardShouldPersistTaps="handled">
      {form ? (
        <Card large style={styles.card}>
          <AppText variant="eyebrow" color={c.goldInk}>{form.id ? 'Edycja funkcji' : 'Nowa funkcja'}</AppText>
          <TextField label="Nazwa" placeholder="np. Kantor" value={form.name} onChangeText={v => setForm({ ...form, name: v })} maxLength={40} />
          <TextField label="Opis (opcjonalnie)" placeholder="np. Śpiewa aklamację przed Ewangelią" value={form.description}
            onChangeText={v => setForm({ ...form, description: v })} maxLength={160} />
          <Button label="Zapisz" icon="check" onPress={save} loading={saving} />
          {form.id && <Button label="Usuń funkcję" icon="delete" variant="secondary" onPress={() => setConfirmDelete(true)} />}
          <Button label="Anuluj" variant="ghost" onPress={() => setForm(null)} />
        </Card>
      ) : (
        <>
          <AppText variant="small" muted style={styles.intro}>
            Funkcje to to, co ministrant może pełnić (jedna osoba może mieć kilka). Nadajesz je w profilu członka.
            Gdy na Mszy włączysz rolę o nazwie funkcji, ministranci zajmą ją sami tylko z tą funkcją.
          </AppText>
          {functions.map(f => (
            <Card key={f.id} onPress={() => setForm({ id: f.id, name: f.name, description: f.description ?? '' })} style={styles.card}>
              <View style={styles.row}>
                <Icon name="account-star" size={20} color={c.goldInk} />
                <View style={styles.flex}>
                  <AppText variant="bodyStrong">{f.name}</AppText>
                  {!!f.description && <AppText variant="small" muted>{f.description}</AppText>}
                </View>
                <AppText variant="small" muted>{`${count(f)} os.`}</AppText>
                <Icon name="chevron-right" size={20} color={c.subtext} />
              </View>
            </Card>
          ))}
          <Button label="Dodaj funkcję" icon="plus" onPress={() => setForm({ id: null, name: '', description: '' })} />
        </>
      )}
      <ConfirmDialog
        visible={confirmDelete}
        title="Usunąć funkcję?"
        message="Osoby stracą tę funkcję. Role na Mszach o tej nazwie będą dostępne dla wszystkich."
        confirmText="Usuń"
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={remove}
      />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 16, gap: 10, paddingBottom: 32 },
  desktop: { padding: 28, paddingHorizontal: 32, maxWidth: 720, width: '100%' },
  card: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  intro: { paddingHorizontal: 4 },
})

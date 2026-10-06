import { useState } from 'react'
import { Pressable, StyleSheet, Switch, TextInput, View } from 'react-native'
import Toast from 'react-native-toast-message'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../lib/ThemeContext'
import { sans } from '../../lib/theme'
import { PointCategory, usePointCategories } from '../../hooks/usePointCategories'
import { ConfirmDialog } from '../ConfirmDialog'
import { AppText, Button, Card, Icon, Sheet, TextField } from '../ui'

const ICONS = ['star', 'church', 'candle', 'cross', 'bell', 'book-open-variant', 'music', 'broom', 'walk', 'flower', 'heart', 'account-group']

type Form = { id: string | null; name: string; points: string; icon: string; for_services: boolean; for_manual: boolean }
const EMPTY: Form = { id: null, name: '', points: '5', icon: 'star', for_services: true, for_manual: true }

/** Własne kategorie punktowania parafii: rodzaj służby z własną punktacją i/lub gotowy powód ręcznego przyznania. */
export function PointCategoriesCard() {
  const { colors: c } = useTheme()
  const parishId = useAuthStore(s => s.profile?.parish_id)
  const { categories, reload } = usePointCategories()
  const [form, setForm] = useState<Form | null>(null)
  const [saving, setSaving] = useState(false)
  const [toDelete, setToDelete] = useState<PointCategory | null>(null)

  const edit = (cat: PointCategory) => setForm({ id: cat.id, name: cat.name, points: String(cat.points), icon: cat.icon,
    for_services: cat.for_services, for_manual: cat.for_manual })

  const save = async () => {
    if (!form || !parishId) return
    const name = form.name.trim()
    const pts = parseInt(form.points)
    if (!name) { Toast.show({ type: 'error', text1: 'Wpisz nazwę kategorii' }); return }
    if (isNaN(pts) || pts < 0 || pts > 100) { Toast.show({ type: 'error', text1: 'Punkty: liczba od 0 do 100' }); return }
    if (!form.for_services && !form.for_manual) { Toast.show({ type: 'error', text1: 'Zaznacz, gdzie kategoria ma działać' }); return }
    setSaving(true)
    const row = { name, points: pts, icon: form.icon, for_services: form.for_services, for_manual: form.for_manual }
    const { error } = form.id
      ? await supabase.from('point_categories').update(row).eq('id', form.id)
      : await supabase.from('point_categories').insert({ ...row, parish_id: parishId })
    setSaving(false)
    if (error) {
      Toast.show({ type: 'error', text1: 'Nie zapisano', text2: error.code === '23505' ? 'Kategoria o tej nazwie już jest.' : error.message })
      return
    }
    setForm(null)
    reload()
    Toast.show({ type: 'success', text1: form.id ? 'Kategoria zapisana' : 'Kategoria dodana', text2: name })
  }

  const remove = async () => {
    const cat = toDelete
    setToDelete(null)
    if (!cat) return
    const { error } = await supabase.from('point_categories').delete().eq('id', cat.id)
    if (error) { Toast.show({ type: 'error', text1: 'Błąd', text2: error.message }); return }
    setForm(null)
    reload()
  }

  const where = (cat: PointCategory) => [cat.for_services && 'służby', cat.for_manual && 'ręcznie'].filter(Boolean).join(' · ')

  return (
    <Card large style={styles.card}>
      <View style={styles.head}>
        <AppText variant="eyebrow" color={c.goldInk} style={styles.flex}>Własne kategorie parafii</AppText>
        <Button compact icon="plus" label="Dodaj" variant="secondary" onPress={() => setForm({ ...EMPTY })} />
      </View>
      <AppText variant="small" muted>
        Np. Roraty, Pogrzeb, Ślub, Droga Krzyżowa, Sprzątanie zakrystii. Kategorię „do służb” wybierasz przy służbie, cyklu
        albo pozycji rozkładu Mszy — obecność daje wtedy jej punkty. Kategoria „ręcznie” to gotowy powód w „Przyznaj punkty”.
      </AppText>
      {categories.length === 0 && <AppText variant="small" muted style={{ paddingVertical: 6 }}>Brak własnych kategorii.</AppText>}
      {categories.map((cat, i) => (
        <Pressable key={cat.id} accessibilityRole="button" onPress={() => edit(cat)}
          style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }]}>
          <View style={[styles.iconTile, { backgroundColor: c.goldSurface }]}>
            <Icon name={cat.icon} size={20} color={c.goldInk} />
          </View>
          <View style={styles.flex}>
            <AppText variant="bodyStrong">{cat.name}</AppText>
            <AppText variant="small" muted>{where(cat)}</AppText>
          </View>
          <AppText variant="bodyStrong" color={c.primary}>{`${cat.points} pkt`}</AppText>
          <Icon name="pencil" size={18} color={c.subtext} />
        </Pressable>
      ))}

      <Sheet visible={!!form} onClose={() => setForm(null)} title={form?.id ? 'Edytuj kategorię' : 'Nowa kategoria'}>
        {form && (
          <View style={styles.form}>
            <TextField label="Nazwa" placeholder="np. Roraty" value={form.name} maxLength={40}
              onChangeText={v => setForm({ ...form, name: v })} />
            <View style={styles.row}>
              <AppText variant="bodyStrong" style={styles.flex}>Punkty</AppText>
              <TextInput value={form.points} onChangeText={v => setForm({ ...form, points: v.replace(/[^0-9]/g, '') })}
                keyboardType="number-pad" maxLength={3} selectTextOnFocus
                style={[styles.input, { backgroundColor: c.primarySurface, color: c.primary }]} />
              <AppText variant="small" muted>pkt</AppText>
            </View>
            <AppText variant="label" muted>Ikona</AppText>
            <View style={styles.icons}>
              {ICONS.map(ic => (
                <Pressable key={ic} accessibilityRole="button" accessibilityLabel={ic} onPress={() => setForm({ ...form, icon: ic })}
                  style={[styles.iconPick, { borderColor: form.icon === ic ? c.primary : c.border, backgroundColor: form.icon === ic ? c.primarySurface : 'transparent' }]}>
                  <Icon name={ic} size={20} color={form.icon === ic ? c.primary : c.subtext} />
                </Pressable>
              ))}
            </View>
            <View style={styles.row}>
              <View style={styles.flex}>
                <AppText variant="bodyStrong">Do służb</AppText>
                <AppText variant="small" muted>Wybierana przy służbie / rozkładzie — punkty za obecność</AppText>
              </View>
              <Switch value={form.for_services} onValueChange={v => setForm({ ...form, for_services: v })}
                trackColor={{ true: c.primary, false: c.inputBorder }} thumbColor="#FFFFFF" />
            </View>
            <View style={styles.row}>
              <View style={styles.flex}>
                <AppText variant="bodyStrong">Do ręcznego przyznawania</AppText>
                <AppText variant="small" muted>Gotowy powód w „Przyznaj punkty”</AppText>
              </View>
              <Switch value={form.for_manual} onValueChange={v => setForm({ ...form, for_manual: v })}
                trackColor={{ true: c.primary, false: c.inputBorder }} thumbColor="#FFFFFF" />
            </View>
            <Button label={form.id ? 'Zapisz' : 'Dodaj kategorię'} onPress={save} loading={saving} />
            {form.id && (
              <Button label="Usuń kategorię" variant="secondary" icon="delete"
                onPress={() => setToDelete(categories.find(x => x.id === form.id) ?? null)} />
            )}
          </View>
        )}
      </Sheet>
      <ConfirmDialog visible={!!toDelete} title="Usunąć kategorię?" destructive confirmText="Usuń"
        message={toDelete ? `Służby z kategorią „${toDelete.name}” wrócą do punktacji wg reguł. Przyznane już punkty zostają.` : ''}
        onCancel={() => setToDelete(null)} onConfirm={remove} />
    </Card>
  )
}

const styles = StyleSheet.create({
  card: { gap: 6 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  iconTile: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  form: { gap: 12 },
  input: { ...sans(800), borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, fontSize: 18, width: 64, textAlign: 'center' },
  icons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconPick: { width: 42, height: 42, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
})

import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useTheme } from '../../lib/ThemeContext'
import { sans, serif } from '../../lib/theme'
import { localDateStr } from '../../lib/dates'
import { WIEDZA_DATA } from '../../lib/wiedza'
import { AppText, Icon, Sheet } from '../ui'

type DailyWord = { date: string; sigla: string; text: string; source: string | null }

/** Wszystkie wbudowane hasła z adresem ekranu — do „Hasła dnia”, gdy brak Słowa dnia. */
const TERMS = WIEDZA_DATA.flatMap(cat => cat.sections.flatMap(sec => sec.items.map(it => ({
  title: it.title,
  sub: `${cat.title} · ${it.subtitle ?? sec.title}`,
  route: cat.searchable ? `/wiedza/slowniczek/${it.id}` : `/wiedza/${cat.id}/${it.id}`,
}))))

/** Hasło dnia: stałe w danym dniu, kolejne co dzień. */
export function termOfDay(date: string) {
  const day = Math.floor(new Date(date + 'T12:00:00Z').getTime() / 86_400_000)
  return TERMS[((day % TERMS.length) + TERMS.length) % TERMS.length]
}

/** N7: Słowo dnia z tabeli daily_word (null, gdy brak wpisu lub tabeli). */
export function useDailyWord() {
  const today = localDateStr()
  const { data } = useQuery({
    queryKey: ['daily-word', today],
    staleTime: 60 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('daily_word').select('date, sigla, text, source').eq('date', today).maybeSingle()
      return error ? null : (data as DailyWord | null)
    },
  })
  return data ?? null
}

/** Granatowa karta: Słowo dnia (Pismo Święte), a gdy brak — Hasło dnia z Wiedzy. */
export function DailyWordCard() {
  const router = useRouter()
  const { colors: c } = useTheme()
  const word = useDailyWord()
  const [open, setOpen] = useState(false)
  const term = termOfDay(localDateStr())

  return (
    <>
      <Pressable
        accessibilityRole="button"
        onPress={() => (word ? setOpen(true) : router.push(term.route as any))}
        style={({ hovered }: any) => [styles.card, { backgroundColor: c.primary, opacity: hovered ? 0.95 : 1 }]}
      >
        <Icon name={word ? 'book-cross' : 'book-open-variant'} size={28} color={c.gold} />
        <View style={styles.flex}>
          <AppText variant="eyebrow" color={c.gold}>{word ? 'Słowo dnia' : 'Hasło dnia'}</AppText>
          <AppText style={[serif(), styles.title]} numberOfLines={2}>{word ? word.sigla : term.title}</AppText>
          <AppText style={styles.sub} numberOfLines={word ? 3 : 1}>{word ? word.text : term.sub}</AppText>
        </View>
        <Icon name="chevron-right" size={22} color="#AEBBD0" />
      </Pressable>

      {word && (
        <Sheet visible={open} onClose={() => setOpen(false)} eyebrow="Słowo dnia" title={word.sigla}>
          <AppText style={[serif(true), styles.full, { color: c.text }]}>{word.text}</AppText>
          {!!word.source && <AppText variant="small" muted>{word.source}</AppText>}
        </Sheet>
      )}
    </>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: 20, cursor: 'pointer' } as any,
  title: { fontSize: 26, lineHeight: 30, color: '#FFFFFF', marginTop: 2 },
  sub: { ...sans(500), fontSize: 13, lineHeight: 18, color: '#C9D3E3', marginTop: 2 },
  full: { fontSize: 22, lineHeight: 31 },
})

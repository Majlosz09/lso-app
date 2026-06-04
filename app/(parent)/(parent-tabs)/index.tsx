import { useEffect, useMemo, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../../lib/supabase'
import { shadow } from '../../../lib/shadows'
import { useAuthStore } from '../../../stores/authStore'
import { getLiturgicalDay, getLiturgicalAccentColor, getLiturgicalBgColor } from '../../../lib/liturgy'
import { useTheme } from '../../../lib/ThemeContext'
import { Colors } from '../../../lib/theme'

function localDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

type ChildSummary = {
  id: string
  full_name: string
  rank_name: string | null
  services_count: number
  nextDuty: { title: string; date: string; time: string | null } | null
  badges: string[]
}

export default function HomeScreen() {
  const { profile } = useAuthStore()
  const router = useRouter()
  const firstName = profile?.full_name?.split(' ')[0] ?? '—'
  const today = localDateStr(new Date())
  const todayLiturgy = getLiturgicalDay(today)
  const litAccent = getLiturgicalAccentColor(todayLiturgy)
  const litBg = getLiturgicalBgColor(todayLiturgy)

  const [children, setChildren] = useState<ChildSummary[]>([])
  const [loading, setLoading] = useState(true)

  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])

  useEffect(() => {
    if (!profile?.id) return
    let cancelled = false
    const fetch = async () => {
      const { data: kids } = await supabase
        .from('profiles')
        .select('id, full_name, rank_id, ranks(name)')
        .eq('parent_id', profile.id)

      if (cancelled) return
      if (!kids || kids.length === 0) { setLoading(false); return }

      const results = await Promise.all(
        kids.map(async (k: any) => {
          const [summaryRes, nextRes, badgesRes] = await Promise.all([
            supabase.from('points_summary').select('services_count').eq('profile_id', k.id).maybeSingle(),
            supabase.from('schedule_assignments')
              .select('schedule:schedules(title, date, time)')
              .eq('profile_id', k.id)
              .gte('schedule.date', today)
              .order('schedule(date)', { ascending: true })
              .order('schedule(time)', { ascending: true })
              .limit(1)
              .maybeSingle(),
            supabase.from('member_badges')
              .select('badge_definition:badge_definitions(icon)')
              .eq('profile_id', k.id)
              .eq('is_active', true),
          ])
          const assignment = nextRes.data as any
          const nextDuty = assignment?.schedule ?? null
          return {
            id: k.id,
            full_name: k.full_name,
            rank_name: (k as any).ranks?.name ?? null,
            services_count: (summaryRes.data as any)?.services_count ?? 0,
            nextDuty,
            badges: ((badgesRes.data ?? []) as any[]).map((b: any) => b.badge_definition?.icon).filter(Boolean),
          }
        })
      )
      if (cancelled) return
      setChildren(results)
      setLoading(false)
    }
    fetch()
    return () => { cancelled = true }
  }, [profile?.id])

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.greetingCard}>
        <Text style={styles.greetingName}>Witaj, {firstName}!</Text>
        <View style={styles.greetingMeta}>
          <Text style={styles.greetingRole}>Rodzic</Text>
        </View>
      </View>

      {todayLiturgy && (
        <View style={[styles.liturgyRow, litBg && { backgroundColor: litBg + '18', borderColor: litBg + '40' }]}>
          {litAccent && <View style={[styles.liturgyDot, { backgroundColor: litAccent }]} />}
          <Text style={styles.liturgyTypeLabel}>{todayLiturgy.typeLabel}:</Text>
          <Text style={styles.liturgyName} numberOfLines={2}>{todayLiturgy.name}</Text>
        </View>
      )}

      <Text style={styles.sectionLabel}>Moje dzieci</Text>
      {loading ? (
        <ActivityIndicator color={c.primary} style={{ marginVertical: 8 }} />
      ) : children.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="people-outline" size={28} color={c.iconMuted} />
          <Text style={styles.emptyText}>Brak powiązanych kont dzieci</Text>
          <Text style={[styles.emptyText, { fontSize: 12, marginTop: 4 }]}>Poproś administratora o przypisanie konta</Text>
        </View>
      ) : (
        children.map(child => (
          <TouchableOpacity
            key={child.id}
            style={styles.childCard}
            onPress={() => router.push(`/(parent)/member-profile?id=${child.id}`)}
            activeOpacity={0.8}
          >
            <View style={styles.childCardTop}>
              <View style={styles.childAvatarSmall}>
                <Ionicons name="person" size={16} color={c.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.childCardName}>{child.full_name}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  <Text style={[styles.childCardMeta, child.rank_name ? { color: c.primary, fontWeight: '500' } : {}]}>
                    {child.rank_name ?? 'Brak rangi'}
                  </Text>
                  {child.badges.slice(0, 3).map((icon: string, idx: number) => (
                    <Text key={idx} style={{ fontSize: 13 }}>{icon}</Text>
                  ))}
                  {child.badges.length > 3 && (
                    <Text style={styles.childCardMeta}>+{child.badges.length - 3}</Text>
                  )}
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color={c.textTertiary} />
            </View>
            {child.nextDuty ? (
              <View style={styles.childNextDuty}>
                <Ionicons name="calendar-outline" size={13} color={c.primary} />
                <Text style={styles.childNextDutyText} numberOfLines={1}>
                  Najbliższy dyżur: {child.nextDuty.title} ·{' '}
                  {new Date(child.nextDuty.date + 'T12:00:00').toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'short' })}
                  {' '}{child.nextDuty.time?.slice(0, 5)}
                </Text>
              </View>
            ) : (
              <View style={styles.childNextDuty}>
                <Ionicons name="calendar-outline" size={13} color={c.textTertiary} />
                <Text style={[styles.childNextDutyText, { color: c.textTertiary }]}>Brak nadchodzących dyżurów</Text>
              </View>
            )}
          </TouchableOpacity>
        ))
      )}

      <Text style={styles.sectionLabel}>Szybkie akcje</Text>
      <View style={styles.actionsRow}>
        <QuickAction icon="calendar-outline" color={c.primary} label="Dyżury dzieci" onPress={() => router.push('/(parent)/(parent-tabs)/schedule')} styles={styles} />
        <QuickAction icon="megaphone-outline" color={c.primary} label="Ogłoszenia" onPress={() => router.push('/(parent)/(parent-tabs)/announcements')} styles={styles} />
        <QuickAction icon="trophy-outline" color={c.gold} label="Punkty" onPress={() => router.push('/(parent)/(parent-tabs)/points')} styles={styles} />
      </View>
    </ScrollView>
  )
}

function QuickAction({ icon, color, label, onPress, styles }: { icon: any; color: string; label: string; onPress: () => void; styles: any }) {
  return (
    <TouchableOpacity style={styles.quickAction} onPress={onPress} activeOpacity={0.75}>
      <View style={[styles.quickIcon, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={24} color={color} />
      </View>
      <Text style={styles.quickLabel}>{label}</Text>
    </TouchableOpacity>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    content: { padding: 16, gap: 16 },
    greetingCard: {
      backgroundColor: c.primary, borderRadius: 16, padding: 20, gap: 8,
      ...shadow.brand,
    },
    greetingName: { fontSize: 24, fontWeight: '700', color: '#fff' },
    greetingMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    greetingRole: { fontSize: 13, color: '#ffffffCC', fontWeight: '500' },
    liturgyRow: {
      flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap',
      paddingHorizontal: 14, paddingVertical: 10, gap: 6,
      backgroundColor: c.goldSurface, borderRadius: 12,
      borderWidth: 1, borderColor: c.border,
    },
    liturgyDot: { width: 8, height: 8, borderRadius: 4 },
    liturgyTypeLabel: { fontSize: 12, color: c.gold, fontWeight: '600' },
    liturgyName: { fontSize: 13, color: c.text, flex: 1 },
    sectionLabel: {
      fontSize: 12, fontWeight: '700', color: c.textTertiary,
      textTransform: 'uppercase', letterSpacing: 0.8,
    },
    emptyCard: {
      backgroundColor: c.surface, borderRadius: 12, padding: 20,
      alignItems: 'center', gap: 6,
      ...shadow.xs,
    },
    emptyText: { fontSize: 13, color: c.textTertiary },
    childCard: {
      backgroundColor: c.surface, borderRadius: 12, padding: 14,
      gap: 8, ...shadow.xs,
    },
    childCardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    childAvatarSmall: {
      width: 32, height: 32, borderRadius: 16,
      backgroundColor: c.primaryAlpha08, justifyContent: 'center', alignItems: 'center',
    },
    childCardName: { fontSize: 15, fontWeight: '700', color: c.text },
    childCardMeta: { fontSize: 12, color: c.subtext, marginTop: 1 },
    childNextDuty: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: c.bg },
    childNextDutyText: { flex: 1, fontSize: 12, color: c.primary, fontWeight: '500' },
    actionsRow: { flexDirection: 'row', gap: 10 },
    quickAction: {
      flex: 1, backgroundColor: c.surface, borderRadius: 14, padding: 14,
      alignItems: 'center', gap: 8,
      ...shadow.md,
    },
    quickIcon: { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
    quickLabel: { fontSize: 12, fontWeight: '600', color: c.text, textAlign: 'center' },
  })
}

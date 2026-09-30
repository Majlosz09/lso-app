import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, View } from 'react-native'
import Toast from 'react-native-toast-message'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../stores/authStore'
import { Announcement, Rank } from '../../../types/database'
import { useTheme } from '../../../lib/ThemeContext'
import { sans, serif } from '../../../lib/theme'
import { useIsDesktop } from '../../../hooks/useIsDesktop'
import { announcementWhen } from '../../../components/announcements/AnnouncementsFeed'
import { AppText, Badge, Button, Chip, Icon, ScreenHeader, Sheet, TextField } from '../../../components/ui'

const FIXED_AUDIENCES = [
  { key: 'all', label: 'Wszyscy' },
  { key: 'members', label: 'Ministranci' },
  { key: 'parents', label: 'Rodzice' },
]

export default function AnnouncementsTab() {
  const router = useRouter()
  const isDesktop = useIsDesktop()
  const { profile } = useAuthStore()
  const { colors: c } = useTheme()
  const { openModal } = useLocalSearchParams<{ openModal?: string }>()
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [modalVisible, setModalVisible] = useState(openModal === 'true')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [pinned, setPinned] = useState(false)
  const [audience, setAudience] = useState('all')
  const [ranks, setRanks] = useState<Rank[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [deleteDialog, setDeleteDialog] = useState<{ id: string; title: string } | null>(null)
  const [open, setOpen] = useState<Record<string, boolean>>({})

  const fetchAnnouncements = async () => {
    const { data, error } = await supabase
      .from('announcements')
      .select('*, author:profiles(full_name)')
      .eq('parish_id', profile?.parish_id)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
    if (!error && data) setAnnouncements(data as Announcement[])
    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => {
    supabase.from('ranks').select('*').order('order').then(({ data }) => setRanks(data ?? []))
    fetchAnnouncements()
  }, [])

  const audienceLabel = (t: string) =>
    FIXED_AUDIENCES.find(a => a.key === t)?.label ?? ranks.find(r => r.id === t)?.name ?? 'Wybrana grupa'

  const handleAdd = async () => {
    if (!title.trim()) { Toast.show({ type: 'error', text1: 'Dodaj tytuł ogłoszenia' }); return }
    if (!content.trim()) { Toast.show({ type: 'error', text1: 'Dodaj treść ogłoszenia' }); return }
    setSubmitting(true)
    const { error } = await supabase.from('announcements').insert({
      title: title.trim(),
      content: content.trim(),
      author_id: profile?.id,
      is_pinned: pinned,
      target_audience: audience,
      parish_id: profile?.parish_id,
    })
    setSubmitting(false)
    if (error) { Toast.show({ type: 'error', text1: 'Błąd', text2: error.message }); return }
    setTitle(''); setContent(''); setPinned(false); setAudience('all')
    setModalVisible(false)
    fetchAnnouncements()
    Toast.show({ type: 'success', text1: 'Ogłoszenie opublikowane' })
  }

  const doDelete = async () => {
    if (!deleteDialog) return
    const { id } = deleteDialog
    setDeleteDialog(null)
    const { error } = await supabase.from('announcements').delete().eq('id', id)
    if (error) Toast.show({ type: 'error', text1: 'Błąd', text2: error.message })
    else {
      setAnnouncements(prev => prev.filter(a => a.id !== id))
      Toast.show({ type: 'success', text1: 'Ogłoszenie usunięte' })
    }
  }

  const list = loading ? <ActivityIndicator color={c.primary} style={styles.loader} /> : announcements.length === 0 ? (
    <View style={[styles.empty, { borderColor: c.iconMuted }]}>
      <Icon name="bullhorn" size={36} color={c.iconMuted} />
      <AppText muted>Brak ogłoszeń. Dodaj pierwsze.</AppText>
    </View>
  ) : announcements.map(a => {
    const expanded = open[a.id] ?? a === announcements[0]
    return (
      <Pressable
        key={a.id}
        onPress={() => setOpen(o => ({ ...o, [a.id]: !expanded }))}
        style={[styles.card, { backgroundColor: c.surface, borderColor: a.is_pinned ? c.gold : c.border }]}
      >
        <View style={styles.head}>
          <View style={styles.tags}>
            {a.is_pinned && (
              <View style={[styles.pinned, { backgroundColor: c.primary }]}>
                <Icon name="pin" size={12} color="#FFFFFF" filled />
                <AppText style={styles.pinnedText}>PRZYPIĘTE</AppText>
              </View>
            )}
            <Badge label={audienceLabel(a.target_audience).toUpperCase()} tone="gold" />
          </View>
          <AppText variant="small" muted>{`${(a as any).author?.full_name ?? 'Parafia'} · ${announcementWhen(a.created_at)}`}</AppText>
          <Pressable onPress={() => setDeleteDialog({ id: a.id, title: a.title })} hitSlop={8} accessibilityLabel="Usuń ogłoszenie">
            <Icon name="delete" size={20} color={c.dangerStrong} />
          </Pressable>
        </View>
        <AppText style={isDesktop ? [serif(), styles.titleWeb, { color: c.text }] : [styles.title, { color: c.text }]}>{a.title}</AppText>
        {expanded && <AppText style={[styles.content, { color: c.text }]}>{a.content}</AppText>}
      </Pressable>
    )
  })

  return (
    <View style={[styles.flex, { backgroundColor: c.bg }]}>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchAnnouncements() }} />}>
        {!isDesktop && (
          <ScreenHeader
            title="Ogłoszenia"
            onBack={() => (router.canGoBack() ? router.back() : router.replace('/(admin)/(admin-tabs)'))}
          />
        )}
        <View style={[styles.body, isDesktop && styles.desktop]}>
          <Button label="Nowe ogłoszenie" icon="plus" style={isDesktop ? styles.deskBtn : undefined} onPress={() => setModalVisible(true)} />
          {list}
        </View>
      </ScrollView>

      <Sheet
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title="Nowe ogłoszenie"
        footer={<Button label="Opublikuj" onPress={handleAdd} loading={submitting} />}
      >
        <TextField label="Tytuł" placeholder="np. Zbiórka w sobotę" value={title} onChangeText={setTitle} />
        <TextField label="Treść" placeholder="Co chcesz przekazać?" value={content} onChangeText={setContent} multiline />
        <AppText variant="label" muted>Do kogo</AppText>
        <View style={styles.chips}>
          {FIXED_AUDIENCES.map(a => <Chip key={a.key} label={a.label} selected={audience === a.key} onPress={() => setAudience(a.key)} />)}
          {ranks.map(r => <Chip key={r.id} label={r.name} icon="shield-star" selected={audience === r.id} onPress={() => setAudience(r.id)} />)}
        </View>
        <Pressable onPress={() => setPinned(v => !v)} style={styles.toggle} accessibilityRole="switch" accessibilityState={{ checked: pinned }}>
          <View style={styles.flex}>
            <AppText variant="bodyStrong">Przypnij na górze</AppText>
            <AppText variant="small" muted>Przypięte ogłoszenie jest zawsze pierwsze na liście</AppText>
          </View>
          <Switch value={pinned} onValueChange={setPinned} trackColor={{ true: c.primary, false: c.inputBorder }} thumbColor="#FFFFFF" {...({ activeThumbColor: "#FFFFFF" } as any)} />
        </Pressable>
      </Sheet>

      <Sheet
        visible={!!deleteDialog}
        onClose={() => setDeleteDialog(null)}
        title="Usunąć ogłoszenie?"
        footer={<><Button label="Usuń" variant="danger" onPress={doDelete} /><Button label="Anuluj" variant="secondary" onPress={() => setDeleteDialog(null)} /></>}
      >
        <AppText muted>{`„${deleteDialog?.title ?? ''}” zniknie dla wszystkich.`}</AppText>
      </Sheet>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  loader: { marginTop: 40 },
  body: { padding: 16, gap: 12, paddingBottom: 32 },
  desktop: { padding: 28, paddingHorizontal: 32, maxWidth: 900 },
  deskBtn: { alignSelf: 'flex-start' },
  empty: { alignItems: 'center', gap: 10, padding: 28, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 16 },
  card: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 8, cursor: 'pointer' } as any,
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tags: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pinned: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  pinnedText: { ...sans(800), fontSize: 10, color: '#FFFFFF', letterSpacing: 0.6 },
  title: { ...sans(800), fontSize: 17, lineHeight: 22 },
  titleWeb: { fontSize: 28, lineHeight: 31 },
  content: { ...sans(500), fontSize: 14, lineHeight: 22 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, cursor: 'pointer' } as any,
})

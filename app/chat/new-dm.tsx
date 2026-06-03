// app/chat/new-dm.tsx
import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator, FlatList, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'

interface ProfileItem {
  id: string
  full_name: string
  role: string
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  member: 'Ministrant',
  parent: 'Rodzic',
}

export default function NewDmScreen() {
  const router = useRouter()
  const { profile } = useAuthStore()
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])

  const [users, setUsers] = useState<ProfileItem[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState<string | null>(null)

  useEffect(() => {
    const fetch = async () => {
      if (!profile?.parish_id) return
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('parish_id', profile.parish_id)
        .eq('is_active', true)
        .neq('id', profile.id)
        .order('full_name')
      if (data) setUsers(data)
      setLoading(false)
    }
    fetch()
  }, [profile?.parish_id, profile?.id])

  const openOrCreateDm = async (targetId: string, targetName: string) => {
    if (!profile?.id || !profile?.parish_id || creating) return
    setCreating(targetId)

    // Sprawdź czy DM już istnieje
    const { data: myChannels } = await supabase
      .from('chat_members')
      .select('channel_id, channel:chat_channels!inner(id, type)')
      .eq('user_id', profile.id)
      .eq('chat_channels.type', 'dm')

    if (myChannels) {
      for (const m of myChannels) {
        const { count } = await supabase
          .from('chat_members')
          .select('*', { count: 'exact', head: true })
          .eq('channel_id', m.channel_id)
          .eq('user_id', targetId)
        if (count && count > 0) {
          router.replace(`/chat/${m.channel_id}`)
          return
        }
      }
    }

    // Utwórz nowy kanał DM
    const { data: newChannel, error } = await supabase
      .from('chat_channels')
      .insert({ parish_id: profile.parish_id, type: 'dm', name: targetName })
      .select()
      .single()

    if (error || !newChannel) { setCreating(null); return }

    await supabase.from('chat_members').insert([
      { channel_id: newChannel.id, user_id: profile.id },
      { channel_id: newChannel.id, user_id: targetId },
    ])

    router.replace(`/chat/${newChannel.id}`)
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={c.primary} />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={users}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, gap: 8 }}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={{ color: c.subtext }}>Brak innych użytkowników w parafii</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => openOrCreateDm(item.id, item.full_name)}
            disabled={creating === item.id}
            activeOpacity={0.7}
          >
            <View style={styles.avatar}>
              {creating === item.id
                ? <ActivityIndicator size="small" color={c.primary} />
                : <Ionicons name="person" size={20} color={c.primary} />
              }
            </View>
            <View>
              <Text style={styles.name}>{item.full_name}</Text>
              <Text style={styles.role}>{ROLE_LABELS[item.role] ?? item.role}</Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    row: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: c.surface, borderRadius: 12,
      padding: 12, gap: 12,
    },
    avatar: {
      width: 40, height: 40, borderRadius: 20,
      backgroundColor: c.primary + '18',
      justifyContent: 'center', alignItems: 'center',
    },
    name: { fontSize: 15, color: c.text, fontWeight: '500' },
    role: { fontSize: 12, color: c.subtext, marginTop: 2 },
  })
}

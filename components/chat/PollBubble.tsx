import { useMemo } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'
import { ChatPoll } from '../../types/chat'

interface Props {
  poll: ChatPoll
  currentUserId: string
  isOwn: boolean
  onVote: (optionId: string) => void
  onClose: () => void
}

export function PollBubble({ poll, currentUserId, isOwn, onVote, onClose }: Props) {
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])

  const totalVotes = poll.options.reduce((sum, o) => sum + o.votes.length, 0)
  const userVotedOptionIds = poll.options
    .filter((o) => o.votes.some((v) => v.user_id === currentUserId))
    .map((o) => o.id)
  const isClosed = !!poll.closed_at

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: c.primary }]}>📊 ANKIETA</Text>
      <Text style={[styles.question, { color: c.text }]}>{poll.question}</Text>
      {poll.options
        .sort((a, b) => a.position - b.position)
        .map((option) => {
          const pct = totalVotes > 0 ? Math.round((option.votes.length / totalVotes) * 100) : 0
          const voted = userVotedOptionIds.includes(option.id)
          return (
            <TouchableOpacity
              key={option.id}
              disabled={isClosed}
              onPress={() => onVote(option.id)}
              style={[
                styles.option,
                { backgroundColor: c.surface, borderColor: voted ? c.primary : c.border },
              ]}
            >
              <View style={[styles.fill, { width: `${pct}%` as any, backgroundColor: c.primaryAlpha12 }]} />
              <Text style={[styles.optionText, { color: c.text }]}>{option.text}</Text>
              <Text style={[styles.pct, { color: voted ? c.primary : c.subtext }]}>{pct}%</Text>
            </TouchableOpacity>
          )
        })}
      <Text style={[styles.meta, { color: c.subtext }]}>
        {totalVotes === 0 ? 'Brak głosów' : `${totalVotes} głosów`}
        {isClosed ? ' · zamknięta' : poll.allow_multiple ? ' · możesz wybrać kilka' : ''}
      </Text>
      {isOwn && !isClosed && (
        <TouchableOpacity onPress={onClose}>
          <Text style={[styles.closeBtn, { color: c.subtext }]}>Zamknij ankietę</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    container: { gap: 6 },
    label: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
    question: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
    option: {
      borderWidth: 1, borderRadius: 8,
      padding: 8, paddingHorizontal: 10,
      flexDirection: 'row', alignItems: 'center',
      overflow: 'hidden', position: 'relative',
    },
    fill: { position: 'absolute', top: 0, left: 0, bottom: 0, borderRadius: 8 },
    optionText: { flex: 1, fontSize: 13 },
    pct: { fontSize: 12, fontWeight: '600' },
    meta: { fontSize: 11, marginTop: 2 },
    closeBtn: { fontSize: 12, marginTop: 2, textDecorationLine: 'underline' },
  })
}

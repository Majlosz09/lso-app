import { StyleSheet, TouchableOpacity, View } from 'react-native'
import { useTheme } from '../../lib/ThemeContext'
import { sans } from '../../lib/theme'
import { ChatPoll } from '../../types/chat'
import { pl } from '../../lib/dates'
import { AppText, Icon } from '../ui'

interface Props {
  poll: ChatPoll
  currentUserId: string
  isOwn: boolean
  onVote: (optionId: string) => void
  onClose: () => void
}

export function PollBubble({ poll, currentUserId, isOwn, onVote, onClose }: Props) {
  const { colors: c } = useTheme()

  const totalVotes = poll.options.reduce((sum, o) => sum + o.votes.length, 0)
  const userVotedOptionIds = poll.options
    .filter((o) => o.votes.some((v) => v.user_id === currentUserId))
    .map((o) => o.id)
  const isClosed = !!poll.closed_at
  // ankieta w granatowym (własnym) dymku — jasne kolory tekstu
  const fg = isOwn ? '#FFFFFF' : c.text
  const sub = isOwn ? 'rgba(255,255,255,0.75)' : c.subtext
  const accent = isOwn ? c.gold : c.goldInk

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Icon name="poll" size={16} color={accent} />
        <AppText style={[styles.label, { color: accent }]}>ANKIETA</AppText>
      </View>
      <AppText style={[styles.question, { color: fg }]}>{poll.question}</AppText>
      {[...poll.options]
        .sort((a, b) => a.position - b.position)
        .map((option) => {
          const pct = totalVotes > 0 ? Math.round((option.votes.length / totalVotes) * 100) : 0
          const voted = userVotedOptionIds.includes(option.id)
          return (
            <TouchableOpacity
              key={option.id}
              disabled={isClosed}
              onPress={() => onVote(option.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: voted, disabled: isClosed }}
              style={[styles.option, { backgroundColor: c.bg, borderColor: voted ? c.primary : c.border }]}
            >
              <View style={[styles.fill, { width: `${pct}%` as any, backgroundColor: c.goldSurface }]} />
              <Icon
                name={voted ? 'radiobox-marked' : 'radiobox-blank'}
                size={18}
                color={voted ? c.primary : c.subtext}
                filled
              />
              <AppText style={[styles.optionText, { color: c.text }]}>{option.text}</AppText>
              <AppText style={[styles.count, { color: c.text }]}>{option.votes.length}</AppText>
            </TouchableOpacity>
          )
        })}
      <AppText style={[styles.meta, { color: sub }]}>
        {totalVotes === 0 ? 'Brak głosów' : `${totalVotes} ${pl(totalVotes, ['głos', 'głosy', 'głosów'])}`}
        {isClosed ? ' · zamknięta' : poll.allow_multiple ? ' · możesz wybrać kilka' : ' · głos możesz zmienić'}
      </AppText>
      {isOwn && !isClosed && (
        <TouchableOpacity onPress={onClose} accessibilityRole="button">
          <AppText style={[styles.closeBtn, { color: sub }]}>Zamknij ankietę</AppText>
        </TouchableOpacity>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: 7, minWidth: 240 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { ...sans(800), fontSize: 10, letterSpacing: 1.2 },
  question: { ...sans(800), fontSize: 16, lineHeight: 21, marginBottom: 2 },
  option: {
    borderWidth: 1, borderRadius: 12,
    paddingVertical: 9, paddingHorizontal: 12, gap: 10,
    flexDirection: 'row', alignItems: 'center',
    overflow: 'hidden', position: 'relative',
  },
  fill: { position: 'absolute', top: 0, left: 0, bottom: 0 },
  optionText: { flex: 1, ...sans(600), fontSize: 14 },
  count: { ...sans(800), fontSize: 13, fontVariant: ['tabular-nums'] },
  meta: { ...sans(600), fontSize: 11, marginTop: 2 },
  closeBtn: { ...sans(700), fontSize: 12, marginTop: 2, textDecorationLine: 'underline' },
})

import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useTheme } from '../lib/ThemeContext'
import { sans } from '../lib/theme'
import { BADGE_CATALOG } from '../lib/badges'
import type { BadgeWithDef } from './FormationBadges'
import { AppText, Button, Sheet } from './ui'

/** Siatka odznak (emoji w granatowym kółku) + szczegóły odznaki w arkuszu. */
export function BadgeGrid({ badges, emptyText }: { badges: BadgeWithDef[]; emptyText: string }) {
  const { colors: c } = useTheme()
  const [open, setOpen] = useState<BadgeWithDef | null>(null)
  if (badges.length === 0) return <AppText muted>{emptyText}</AppText>
  return (
    <>
      <View style={styles.grid}>
        {badges.map(b => (
          <Pressable key={b.id} style={styles.badge} onPress={() => setOpen(b)} accessibilityRole="button">
            <View style={[styles.circle, { backgroundColor: c.primary }]}>
              <AppText style={styles.icon}>{b.badge_definition?.icon ?? '🏅'}</AppText>
            </View>
            <AppText style={[styles.name, { color: c.text }]} numberOfLines={2}>{b.badge_definition?.name}</AppText>
          </Pressable>
        ))}
      </View>
      <Sheet
        visible={!!open}
        onClose={() => setOpen(null)}
        eyebrow="Odznaka"
        title={open?.badge_definition?.name ?? ''}
        footer={<Button label="OK" onPress={() => setOpen(null)} />}
      >
        <View style={styles.detail}>
          <View style={[styles.circleBig, { backgroundColor: c.primary }]}>
            <AppText style={styles.iconBig}>{open?.badge_definition?.icon ?? '🏅'}</AppText>
          </View>
          <AppText muted style={styles.detailText}>
            {BADGE_CATALOG[open?.badge_definition?.criteria_key ?? ''] ?? 'Przyznawana ręcznie przez opiekuna.'}
          </AppText>
          {!!open?.awarded_at && (
            <AppText variant="small" muted>
              {`Zdobyta ${new Date(open.awarded_at).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })}`}
            </AppText>
          )}
        </View>
      </Sheet>
    </>
  )
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  badge: { width: 84, alignItems: 'center', gap: 6, cursor: 'pointer' } as any,
  circle: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 22 },
  name: { ...sans(700), fontSize: 11, textAlign: 'center' },
  detail: { alignItems: 'center', gap: 10 },
  circleBig: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
  iconBig: { fontSize: 34 },
  detailText: { textAlign: 'center' },
})

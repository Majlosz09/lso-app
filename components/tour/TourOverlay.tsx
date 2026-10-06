import { useEffect, useRef, useState } from 'react'
import { Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native'
import { useRouter } from 'expo-router'
import { useTour, tourTargetViews } from '../../stores/tourStore'
import { Rect, cardPlacement, usableRect } from '../../lib/tour'
import { useTheme } from '../../lib/ThemeContext'
import { serif } from '../../lib/theme'
import { AppText, Button } from '../ui'

const DIM = 'rgba(7,28,58,0.62)'
const PAD = 6
// element pojawia się po przejściu na ekran — kilka prób pomiaru
const MEASURE_AT = [120, 400, 800, 1400, 2200]

function measure(v: View): Promise<Rect | null> {
  return new Promise(resolve => {
    try { v.measureInWindow((x, y, width, height) => resolve({ x, y, width, height })) } catch { resolve(null) }
  })
}

/** Interaktywny przewodnik: przyciemnia ekran, podświetla element kroku i pokazuje kartę z opisem. */
export function TourOverlay() {
  const { active, steps, index, next, back, stop } = useTour()
  const router = useRouter()
  const win = useWindowDimensions()
  const { colors: c } = useTheme()
  const [rect, setRect] = useState<Rect | null>(null)
  const [cardH, setCardH] = useState(220)
  const lastRoute = useRef<string | null>(null)
  const step = active ? steps[index] : undefined

  useEffect(() => {
    if (!active) { lastRoute.current = null; return }
    if (!step) return
    setRect(null)
    if (step.route && step.route !== lastRoute.current) {
      router.navigate(step.route as any)
      lastRoute.current = step.route
    }
    if (!step.target) return
    let cancelled = false
    const timers = MEASURE_AT.map(ms => setTimeout(async () => {
      const views = tourTargetViews(step.target!)
      for (const v of views) {
        const r = await measure(v)
        if (cancelled) return
        if (usableRect(r, win)) { setRect(r); return }
      }
      // web: element poniżej krawędzi ekranu — przewijamy do niego, kolejna próba go zmierzy
      if (Platform.OS === 'web') {
        for (const v of views) {
          const r = await measure(v)
          if (r && r.width > 0 && r.height > 0) { (v as any).scrollIntoView?.({ block: 'center' }); break }
        }
      }
    }, ms))
    return () => { cancelled = true; timers.forEach(clearTimeout) }
  }, [active, index, win.width, win.height])

  if (!active || !step) return null

  const hole = rect ? { x: rect.x - PAD, y: rect.y - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 } : null
  const pos = cardPlacement(hole, win, { width: 380, height: cardH })
  const last = index === steps.length - 1

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none" accessibilityViewIsModal>
      {hole ? (
        <>
          <View style={[styles.dim, { left: 0, top: 0, right: 0, height: Math.max(0, hole.y) }]} />
          <View style={[styles.dim, { left: 0, top: hole.y + hole.height, right: 0, bottom: 0 }]} />
          <View style={[styles.dim, { left: 0, top: hole.y, width: Math.max(0, hole.x), height: hole.height }]} />
          <View style={[styles.dim, { left: hole.x + hole.width, top: hole.y, right: 0, height: hole.height }]} />
          {/* „dziura” też blokuje dotyk — przewodnik prowadzi sam */}
          <View style={[styles.ring, { left: hole.x, top: hole.y, width: hole.width, height: hole.height, borderColor: c.gold }]} />
        </>
      ) : (
        <View style={[styles.dim, StyleSheet.absoluteFill]} />
      )}

      <View
        onLayout={e => setCardH(Math.round(e.nativeEvent.layout.height))}
        style={[styles.card, { left: pos.left, top: pos.top, width: pos.width, backgroundColor: c.surface, borderColor: c.border }]}
      >
        <AppText variant="eyebrow" color={c.goldInk}>{`Przewodnik · ${index + 1} z ${steps.length}`}</AppText>
        <AppText style={[serif(), styles.title, { color: c.text }]}>{step.title}</AppText>
        <AppText variant="small" style={{ color: c.text, lineHeight: 20 }}>{step.body}</AppText>
        <View style={styles.dots}>
          {steps.map((_, i) => (
            <View key={i} style={[styles.dot, { backgroundColor: i === index ? c.gold : c.border }]} />
          ))}
        </View>
        <View style={styles.row}>
          {!last && (
            <Pressable accessibilityRole="button" onPress={stop} hitSlop={8} style={styles.skip}>
              <AppText variant="small" muted>Pomiń</AppText>
            </Pressable>
          )}
          <View style={styles.flex} />
          {index > 0 && <Button compact variant="secondary" label="Wstecz" onPress={back} />}
          <Button compact label={last ? 'Zakończ' : 'Dalej'} icon={last ? 'check' : 'arrow-right'} onPress={next} />
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  dim: { position: 'absolute', backgroundColor: DIM },
  ring: { position: 'absolute', borderWidth: 2.5, borderRadius: 14 },
  card: { position: 'absolute', borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, padding: 18, gap: 8,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
  title: { fontSize: 26, lineHeight: 30 },
  dots: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  flex: { flex: 1 },
  skip: { paddingVertical: 6, paddingRight: 8 },
})

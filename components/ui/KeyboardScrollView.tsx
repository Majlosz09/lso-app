import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Keyboard, KeyboardEvent, Platform, ScrollView, ScrollViewProps, TextInput } from 'react-native'

type Props = ScrollViewProps & {
  /**
   * Dodaj pod treścią miejsce na wysokość klawiatury (domyślnie tak).
   * false — kontener i tak kończy się nad klawiaturą (np. arkusz w KeyboardAvoidingView), tylko przewijamy do pola.
   */
  padForKeyboard?: boolean
}

/** Odstęp między dolną krawędzią aktywnego pola a klawiaturą. */
const GAP = 24

/**
 * ScrollView, w którym klawiatura nie zasłania aktywnego pola (iOS i Android edge-to-edge — tam system sam
 * ekranu nie zmniejsza). Po otwarciu klawiatury: miejsce pod treścią + przewinięcie, gdy pole jest pod klawiaturą.
 * Na webie zwykły ScrollView.
 */
export const KeyboardScrollView = forwardRef<ScrollView, Props>(function KeyboardScrollView(
  { padForKeyboard = true, contentContainerStyle, onScroll, children, ...rest }, ref,
) {
  const inner = useRef<ScrollView>(null)
  useImperativeHandle(ref, () => inner.current as ScrollView)
  const offset = useRef(0)
  const [kb, setKb] = useState(0)

  useEffect(() => {
    if (Platform.OS === 'web') return
    const reveal = (e: KeyboardEvent) => {
      const input = TextInput.State.currentlyFocusedInput?.() as any
      if (!input?.measureInWindow || !inner.current) return
      input.measureInWindow((_x: number, y: number, _w: number, h: number) => {
        const overlap = y + h + GAP - e.endCoordinates.screenY
        if (overlap > 0) inner.current?.scrollTo({ y: offset.current + overlap, animated: true })
      })
    }
    const subs = [
      Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', e => setKb(e.endCoordinates.height)),
      // po ułożeniu ekranu (dodane miejsce / arkusz podniesiony nad klawiaturę)
      Keyboard.addListener('keyboardDidShow', e => setTimeout(() => reveal(e), Platform.OS === 'ios' ? 30 : 80)),
      Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKb(0)),
    ]
    return () => subs.forEach(s => s.remove())
  }, [])

  return (
    <ScrollView
      ref={inner}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}
      scrollEventThrottle={16}
      {...rest}
      onScroll={e => { offset.current = e.nativeEvent.contentOffset.y; onScroll?.(e) }}
      contentContainerStyle={[contentContainerStyle, padForKeyboard && kb > 0 ? { paddingBottom: kb + GAP } : null]}
    >
      {children}
    </ScrollView>
  )
})

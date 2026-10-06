import { ReactNode } from 'react'
import {
  KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../../lib/ThemeContext'
import { radius } from '../../lib/theme'
import { shadow } from '../../lib/shadows'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import { AppText } from './AppText'
import { Icon } from './Icon'
import { KeyboardScrollView } from './/KeyboardScrollView'

type Props = {
  visible: boolean
  onClose: () => void
  title?: string
  /** eyebrow nad tytułem (np. „Msza Święta · Śr 18:00”) */
  eyebrow?: string
  children: ReactNode
  /** przyciski na dole (przyklejone pod treścią) */
  footer?: ReactNode
  testID?: string
}

/**
 * Arkusz akcji: na telefonie wjeżdża od dołu (bottom sheet),
 * na desktopie (web ≥ 1024 px) to wyśrodkowany modal 540 px.
 */
export function Sheet({ visible, onClose, title, eyebrow, children, footer, testID }: Props) {
  const { colors: c } = useTheme()
  const isDesktop = useIsDesktop()
  const insets = useSafeAreaInsets()

  return (
    <Modal
      visible={visible}
      transparent
      animationType={isDesktop ? 'fade' : 'slide'}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior="padding"
        enabled={Platform.OS !== 'web'}
        style={[styles.root, isDesktop ? styles.rootCenter : styles.rootBottom]}
      >
        <Pressable
          accessibilityLabel="Zamknij"
          style={[StyleSheet.absoluteFill, { backgroundColor: c.overlay }]}
          onPress={onClose}
        />
        <View
          testID={testID}
          style={[
            styles.panel,
            { backgroundColor: c.bg },
            isDesktop
              ? [styles.panelDesktop, shadow.modal]
              : [styles.panelMobile, { paddingBottom: Math.max(insets.bottom, 16) + 14 }],
          ]}
        >
          {!isDesktop && <View style={[styles.grabber, { backgroundColor: c.iconMuted }]} />}
          {(title || eyebrow) && (
            <View style={styles.header}>
              <View style={styles.flex}>
                {!!eyebrow && <AppText variant="eyebrow" color={c.goldInk}>{eyebrow}</AppText>}
                {!!title && <AppText variant="title" style={styles.title}>{title}</AppText>}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Zamknij"
                onPress={onClose}
                hitSlop={10}
                style={[styles.close, { backgroundColor: c.borderLight }]}
              >
                <Icon name="close" size={20} color={c.subtext} filled />
              </Pressable>
            </View>
          )}
          <KeyboardScrollView padForKeyboard={false}
            style={styles.flexShrink}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </KeyboardScrollView>
          {footer && <View style={styles.footer}>{footer}</View>}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  rootBottom: { justifyContent: 'flex-end' },
  rootCenter: { justifyContent: 'center', alignItems: 'center', padding: 24 },
  panel: { maxHeight: '85%', flexShrink: 1 },
  panelMobile: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingTop: 10,
    paddingHorizontal: 18,
  },
  panelDesktop: {
    width: '100%',
    maxWidth: 540,
    borderRadius: radius.modal,
    padding: 24,
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 12 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  title: { marginTop: 4 },
  close: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', cursor: 'pointer' } as any,
  flex: { flex: 1 },
  flexShrink: { flexGrow: 0, flexShrink: 1 },
  content: { gap: 14, paddingBottom: 4 },
  footer: { gap: 10, marginTop: 14 },
})

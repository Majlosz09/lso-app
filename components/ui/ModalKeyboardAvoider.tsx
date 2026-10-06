import { ReactNode } from 'react'
import { KeyboardAvoidingView, Platform, StyleSheet } from 'react-native'

/**
 * Pierwsze dziecko <Modal> z polami do wpisywania: podnosi zawartość nad klawiaturę na iOS i na Androidzie
 * (przy edge-to-edge Android sam okna nie zmniejsza). Modal zajmuje cały ekran, więc bez przesunięcia nagłówka.
 */
export function ModalKeyboardAvoider({ children }: { children: ReactNode }) {
  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding" enabled={Platform.OS !== 'web'}>
      {children}
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({ flex: { flex: 1 } })

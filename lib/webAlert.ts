import { Alert, Platform, type AlertButton } from 'react-native'
import Toast from 'react-native-toast-message'

// react-native-web implementuje Alert.alert jako pustą funkcję — na webie nie pokazywały się
// żadne komunikaty ani potwierdzenia (~90 wywołań w apce). Ta nakładka:
//  - komunikat bez wyboru  → Toast (+ wywołuje onPress jedynego przycisku)
//  - pytanie z przyciskami → okno potwierdzenia przeglądarki (OK = akcja, Anuluj = anuluj)
// Na iOS/Android nic się nie zmienia.
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  Alert.alert = (title: string, message?: string, buttons?: AlertButton[]) => {
    const actions = (buttons ?? []).filter(b => b.style !== 'cancel')
    const cancel = (buttons ?? []).find(b => b.style === 'cancel')

    if (actions.length === 0 || (actions.length === 1 && !cancel)) {
      const isError = /błąd|nie udało|error/i.test(title)
      Toast.show({ type: isError ? 'error' : 'info', text1: title, text2: message })
      actions[0]?.onPress?.()
      return
    }

    // Pytanie: pierwsza akcja niebędąca „Anuluj” (zwykle destrukcyjna / potwierdzająca)
    const action = actions.find(b => b.style === 'destructive') ?? actions[actions.length - 1]
    const text = [title, message].filter(Boolean).join('\n\n')
    if (window.confirm(action.text ? `${text}\n\n[OK] = ${action.text}` : text)) {
      action.onPress?.()
    } else {
      cancel?.onPress?.()
    }
  }
}

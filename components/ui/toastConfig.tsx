import { StyleSheet, View } from 'react-native'
import type { ToastConfig, ToastConfigParams } from 'react-native-toast-message'
import { shadow } from '../../lib/shadows'
import { sans } from '../../lib/theme'
import { AppText } from './AppText'
import { Icon } from './Icon'

const ICONS = {
  success: { name: 'check-circle', color: '#C9A55A' },
  info:    { name: 'information', color: '#C9A55A' },
  error:   { name: 'alert-circle', color: '#F2B8A8' },
}

function LsoToast({ text1, text2, type }: ToastConfigParams<unknown> & { type: keyof typeof ICONS }) {
  const icon = ICONS[type]
  return (
    <View style={[styles.toast, type === 'error' && styles.error, shadow.toast]}>
      <Icon name={icon.name} size={20} color={icon.color} filled />
      <View style={styles.body}>
        {!!text1 && <AppText style={styles.t1}>{text1}</AppText>}
        {!!text2 && <AppText style={styles.t2}>{text2}</AppText>}
      </View>
    </View>
  )
}

/** Toasty redesignu: granatowa pigułka ze złotą ikoną (błędy — ciemna czerwień). */
export const toastConfig: ToastConfig = {
  success: p => <LsoToast {...p} type="success" />,
  info:    p => <LsoToast {...p} type="info" />,
  error:   p => <LsoToast {...p} type="error" />,
}

const styles = StyleSheet.create({
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    maxWidth: 480,
    width: '90%',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: '#0B2E5C',
  },
  error: { backgroundColor: '#6E1C17' },
  body: { flex: 1, gap: 2 },
  t1: { ...sans(700), fontSize: 13, lineHeight: 18, color: '#FFFFFF' },
  t2: { ...sans(500), fontSize: 12, lineHeight: 17, color: '#C9D3E3' },
})

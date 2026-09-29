import { forwardRef } from 'react'
import { StyleProp, StyleSheet, TextInput, TextInputProps, View, ViewStyle } from 'react-native'
import { useTheme } from '../../lib/ThemeContext'
import { radius, sans } from '../../lib/theme'
import { AppText } from './AppText'

type Props = TextInputProps & {
  label?: string
  /** komunikat pod polem (np. walidacja kodu parafii) */
  hint?: string
  hintTone?: 'muted' | 'success' | 'danger'
  containerStyle?: StyleProp<ViewStyle>
}

export const TextField = forwardRef<TextInput, Props>(function TextField(
  { label, hint, hintTone = 'muted', containerStyle, style, multiline, ...rest }, ref,
) {
  const { colors: c } = useTheme()
  const hintColor = { muted: c.subtext, success: c.success, danger: c.dangerStrong }[hintTone]
  return (
    <View style={[styles.wrap, containerStyle]}>
      {!!label && <AppText variant="label" muted>{label}</AppText>}
      <TextInput
        ref={ref}
        placeholderTextColor={c.textTertiary}
        multiline={multiline}
        style={[
          styles.input,
          {
            backgroundColor: c.inputBg,
            borderColor: c.inputBorder,
            color: c.text,
            minHeight: multiline ? 96 : 48,
            paddingTop: multiline ? 12 : 0,
            textAlignVertical: multiline ? 'top' : 'center',
          },
          style,
        ]}
        {...rest}
      />
      {!!hint && <AppText variant="small" color={hintColor}>{hint}</AppText>}
    </View>
  )
})

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  input: {
    borderWidth: 1,
    borderRadius: radius.input,
    paddingHorizontal: 14,
    fontSize: 15,
    ...sans(600),
    outlineStyle: 'none',
  } as any,
})

import { Text, TextProps, StyleSheet } from 'react-native'
import { useTheme } from '../../lib/ThemeContext'
import { sans, serif } from '../../lib/theme'

export type TextVariant =
  | 'display'   // Instrument Serif 36 — tytuł ekranu (mobile)
  | 'hero'      // Instrument Serif 44 — liczby, hero
  | 'title'     // Instrument Serif 28 — tytuł arkusza / sekcji
  | 'heading'   // Instrument Serif 22 — nagłówek karty
  | 'body'      // Manrope 14/500
  | 'bodyStrong'// Manrope 14/700
  | 'small'     // Manrope 12/500
  | 'label'     // Manrope 12/700 — etykieta pola
  | 'eyebrow'   // Manrope 11/700 uppercase, letter-spacing 1.4
  | 'button'    // Manrope 15/800

type Props = TextProps & {
  variant?: TextVariant
  color?: string
  /** kolor wtórny (muted) z palety */
  muted?: boolean
  italic?: boolean
}

export function AppText({ variant = 'body', color, muted, italic, style, ...rest }: Props) {
  const { colors: c } = useTheme()
  const base = variants[variant]
  const fontOverride = italic && isSerif(variant) ? serif(true) : null
  return (
    <Text
      {...rest}
      style={[
        base,
        { color: color ?? (muted ? c.subtext : c.text) },
        fontOverride,
        style,
      ]}
    />
  )
}

function isSerif(v: TextVariant) {
  return v === 'display' || v === 'hero' || v === 'title' || v === 'heading'
}

const variants = StyleSheet.create({
  display:    { ...serif(), fontSize: 36, lineHeight: 38 },
  hero:       { ...serif(), fontSize: 44, lineHeight: 46, fontVariant: ['tabular-nums'] },
  title:      { ...serif(), fontSize: 28, lineHeight: 31 },
  heading:    { ...serif(), fontSize: 22, lineHeight: 25 },
  body:       { ...sans(500), fontSize: 14, lineHeight: 21 },
  bodyStrong: { ...sans(700), fontSize: 14, lineHeight: 20 },
  small:      { ...sans(500), fontSize: 12, lineHeight: 17 },
  label:      { ...sans(700), fontSize: 12, lineHeight: 16 },
  eyebrow:    { ...sans(700), fontSize: 11, lineHeight: 14, letterSpacing: 1.4, textTransform: 'uppercase' },
  button:     { ...sans(800), fontSize: 15, lineHeight: 20 },
})

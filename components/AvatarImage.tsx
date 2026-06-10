import { memo } from 'react'
import { View, Image } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { parsePresetUrl } from '../lib/presetAvatar'
import { useTheme } from '../lib/ThemeContext'

interface AvatarImageProps {
  avatarUrl: string | null | undefined
  size?: number
  borderColor?: string
  borderWidth?: number
  placeholderIconSize?: number
}

function AvatarImageComponent({
  avatarUrl,
  size = 80,
  borderColor,
  borderWidth,
}: AvatarImageProps) {
  const { colors: c } = useTheme()
  const preset = parsePresetUrl(avatarUrl)

  const base = {
    width: size,
    height: size,
    borderRadius: size / 2,
    ...(borderColor && borderWidth ? { borderColor, borderWidth } : {}),
  }

  if (preset) {
    return (
      <View style={[base, { backgroundColor: preset.color.bg, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }]}>
        <Ionicons name={preset.icon as any} size={Math.round(size * 0.48)} color={preset.color.iconColor} />
      </View>
    )
  }

  if (avatarUrl) {
    return <Image source={{ uri: avatarUrl }} style={[base, { overflow: 'hidden' }]} />
  }

  return (
    <View style={[base, { backgroundColor: c.primaryAlpha08, justifyContent: 'center', alignItems: 'center' }]}>
      <Ionicons name="person" size={Math.round(size * 0.48)} color={c.primary} />
    </View>
  )
}

export const AvatarImage = memo(AvatarImageComponent)

import { Pressable, StyleSheet, View } from 'react-native'
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../lib/ThemeContext'
import { sans } from '../lib/theme'
import { shadow } from '../lib/shadows'
import { useIsDesktop } from '../hooks/useIsDesktop'
import { AppText } from './ui'
import { tourRef } from './tour/TourTarget'

type Props = BottomTabBarProps & {
  /** trasa wyświetlana jako złoty, wysunięty przycisk (np. „Obecność”) */
  fabRouteName?: string
}

/** Dolny pasek redesignu v2. Na desktopie (web ≥ 1024 px) ukryty — nawigację robi sidebar. */
export function CustomTabBar({ state, descriptors, navigation, fabRouteName }: Props) {
  const insets = useSafeAreaInsets()
  const isDesktop = useIsDesktop()
  const { colors: c } = useTheme()
  if (isDesktop) return null
  // ekrany pełnoekranowe (np. Obecność) chowają pasek przez tabBarStyle: { display: 'none' }
  const focusedOptions = descriptors[state.routes[state.index].key]?.options as any
  if (focusedOptions?.tabBarStyle?.display === 'none') return null

  // Ukryte trasy (href: null) mają tabBarItemStyle display:none / tabBarButton — pomijamy je
  const visibleRoutes = state.routes.filter(route => {
    const o = descriptors[route.key].options as any
    return !o.tabBarButton && o.tabBarItemStyle?.display !== 'none' && o.href !== null
  })

  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: c.surface, borderTopColor: c.border, paddingBottom: Math.max(insets.bottom, 12) },
      ]}
    >
      {visibleRoutes.map(route => {
        const { options } = descriptors[route.key]
        const focused = state.index === state.routes.indexOf(route)
        const label = (options.title ?? route.name) as string
        const isFab = route.name === fabRouteName
        const tourId = `nav:${route.name === 'index' ? 'home' : route.name}`

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name)
        }

        if (isFab) {
          return (
            <Pressable
              key={route.key}
              ref={tourRef(tourId)}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
              onPress={onPress}
              style={[styles.item, styles.fabItem]}
            >
              <View style={[styles.fab, { backgroundColor: c.gold }, shadow.goldFab]}>
                {options.tabBarIcon?.({ focused: true, color: '#071C3A', size: 28 })}
              </View>
              <AppText style={[styles.label, focused ? sans(700) : sans(500), { color: focused ? c.primary : c.subtext }]}>
                {label}
              </AppText>
            </Pressable>
          )
        }

        return (
          <Pressable
            key={route.key}
            ref={tourRef(tourId)}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={label}
            onPress={onPress}
            style={styles.item}
          >
            {options.tabBarIcon?.({ focused, color: focused ? c.primary : c.subtext, size: 24 })}
            <AppText style={[styles.label, focused ? sans(700) : sans(500), { color: focused ? c.primary : c.subtext }]}>
              {label}
            </AppText>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderTopWidth: 1,
    paddingTop: 8,
    overflow: 'visible',
  },
  item: { flex: 1, alignItems: 'center', gap: 3, cursor: 'pointer' } as any,
  fabItem: { marginTop: -26 },
  fab: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 11, lineHeight: 14 },
})

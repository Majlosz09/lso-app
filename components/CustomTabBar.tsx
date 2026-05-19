import { useMemo } from 'react'
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native'
import { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../lib/ThemeContext'
import { Colors } from '../lib/theme'

export function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets()
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])

  const visibleRoutes = state.routes.filter(
    route => !descriptors[route.key].options.tabBarButton
  )
  const centerIndex = Math.floor(visibleRoutes.length / 2)

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom || 8 }]}>
      {visibleRoutes.map((route, index) => {
        const { options } = descriptors[route.key]
        const focused = state.index === state.routes.indexOf(route)
        const isCenter = index === centerIndex

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          })
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name)
          }
        }

        const onLongPress = () => {
          navigation.emit({ type: 'tabLongPress', target: route.key })
        }

        const label = (options.title ?? route.name) as string

        if (isCenter) {
          return (
            <TouchableOpacity
              key={route.key}
              onPress={onPress}
              onLongPress={onLongPress}
              style={styles.centerItem}
              activeOpacity={0.85}
            >
              <View style={[styles.fab, focused && styles.fabFocused]}>
                {options.tabBarIcon?.({ focused, color: '#fff', size: 26 })}
              </View>
              <Text style={[styles.centerLabel, focused && styles.centerLabelFocused]}>
                {label}
              </Text>
            </TouchableOpacity>
          )
        }

        return (
          <TouchableOpacity
            key={route.key}
            onPress={onPress}
            onLongPress={onLongPress}
            style={styles.tabItem}
          >
            {options.tabBarIcon?.({ focused, color: focused ? c.primary : c.textTertiary, size: 22 })}
            <Text style={[styles.label, focused && styles.labelFocused]}>{label}</Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      backgroundColor: c.surface,
      borderTopWidth: 1,
      borderTopColor: c.border,
      alignItems: 'flex-end',
      overflow: 'visible',
      paddingTop: 8,
    },
    tabItem: {
      flex: 1,
      alignItems: 'center',
      gap: 3,
      paddingBottom: 4,
    },
    label: {
      fontSize: 10,
      color: c.textTertiary,
    },
    labelFocused: {
      color: c.primary,
      fontWeight: '600',
    },
    centerItem: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'flex-end',
      paddingBottom: 4,
      marginTop: -20,
    },
    fab: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: '#818CF8',
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 6,
      shadowColor: c.primary,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.4,
      shadowRadius: 8,
    },
    fabFocused: {
      backgroundColor: c.primary,
    },
    centerLabel: {
      fontSize: 10,
      color: c.textTertiary,
      marginTop: 2,
    },
    centerLabelFocused: {
      color: c.primary,
      fontWeight: '600',
    },
  })
}

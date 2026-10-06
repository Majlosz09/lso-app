import { Platform, Text, View, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { isProductionDb } from '../lib/supabase'

// Pasek ostrzegawczy, żeby nigdy nie pomylić bazy dev z produkcją:
//  - baza dev          → mały zielony znacznik „DEV”
//  - produkcja w trybie developerskim (expo start) → czerwony pasek
//  - produkcja w buildzie dla użytkowników → nic
export function EnvBanner() {
  const insets = useSafeAreaInsets()
  if (isProductionDb && !__DEV__) return null

  const prodInDev = isProductionDb
  return (
    <View
      pointerEvents="none"
      // telefon: w pasku statusu (środek), żeby nie zasłaniać nagłówków ekranu; web: u góry strony
      style={[styles.wrap, { top: Platform.OS === 'web' ? insets.top : Math.max(insets.top - 15, 2) }, Platform.OS !== 'web' && styles.native, prodInDev ? styles.prod : styles.dev]}
    >
      <Text style={styles.text}>
        {prodInDev ? '⚠ PRODUKCJA — prawdziwe dane parafii' : 'DEV'}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute', alignSelf: 'center', zIndex: 9999,
    paddingHorizontal: 10, paddingVertical: 2, borderRadius: 6,
  },
  native: { paddingVertical: 0, paddingHorizontal: 6 },
  dev: { backgroundColor: '#2F7D4FCC' },
  prod: { backgroundColor: '#B3261E' },
  text: { color: '#fff', fontSize: 11, fontFamily: 'Manrope_700Bold' },
})

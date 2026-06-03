import { useMemo } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, StatusBar } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'
import { shadow } from '../../lib/shadows'

const FEATURES = [
  {
    icon: 'calendar-outline' as const,
    label: 'Grafik służb',
    sub: 'Automatyczny plan służb na cały rok z powiadomieniami',
  },
  {
    icon: 'checkmark-circle-outline' as const,
    label: 'Weryfikacja obecności',
    sub: 'GPS, kod QR lub potwierdzenie przez administratora',
  },
  {
    icon: 'trophy-outline' as const,
    label: 'System punktacji',
    sub: 'Rankingi i historia punktów motywujące do służby',
  },
]

export default function WelcomeScreen() {
  const router = useRouter()
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={c.primary} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.logoWrap}>
            <Ionicons name="shield-half-outline" size={52} color="#fff" />
          </View>
          <Text style={styles.appName}>LSO App</Text>
          <Text style={styles.appFull}>Liturgiczna Służba Ołtarza</Text>
          <Text style={styles.tagline}>
            Cyfrowe narzędzie dla opiekunów i ministrantów
          </Text>
        </View>

        {/* Features */}
        <View style={styles.section}>
          {FEATURES.map((f, i) => (
            <View key={i} style={styles.featureRow}>
              <View style={styles.featureIcon}>
                <Ionicons name={f.icon} size={22} color={c.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.featureLabel}>{f.label}</Text>
                <Text style={styles.featureSub}>{f.sub}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Free badge */}
        <View style={styles.freeBadge}>
          <Ionicons name="heart-outline" size={15} color={c.primary} />
          <Text style={styles.freeBadgeText}>
            Bezpłatna aplikacja misyjna — wspierana dobrowolnymi ofiarami
          </Text>
        </View>

        {/* CTAs */}
        <TouchableOpacity
          style={styles.btnPrimary}
          onPress={() => router.push('/(auth)/register')}
          activeOpacity={0.85}
        >
          <Ionicons name="business-outline" size={20} color="#fff" />
          <Text style={styles.btnPrimaryText}>Zarejestruj swoją parafię</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.btnSecondary}
          onPress={() => router.push('/(auth)/login')}
          activeOpacity={0.85}
        >
          <Text style={styles.btnSecondaryText}>Mam już konto — zaloguj się</Text>
        </TouchableOpacity>

        <Text style={styles.inviteHint}>
          Jesteś ministrantem? Poproś opiekuna o kod zaproszenia i wybierz{' '}
          <Text style={styles.inviteLink} onPress={() => router.push('/(auth)/register')}>
            Zarejestruj się
          </Text>
          .
        </Text>
      </ScrollView>
    </View>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    scroll: { flex: 1 },
    content: { paddingBottom: 48 },

    // Hero
    hero: {
      backgroundColor: c.primary,
      alignItems: 'center',
      paddingTop: 72,
      paddingBottom: 40,
      paddingHorizontal: 24,
      gap: 8,
    },
    logoWrap: {
      width: 96, height: 96, borderRadius: 28,
      backgroundColor: 'rgba(255,255,255,0.15)',
      justifyContent: 'center', alignItems: 'center',
      marginBottom: 8,
    },
    appName: { fontSize: 36, fontWeight: '900', color: '#fff', letterSpacing: 0.5 },
    appFull: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.75)', letterSpacing: 0.5 },
    tagline: {
      fontSize: 15, color: 'rgba(255,255,255,0.85)',
      textAlign: 'center', lineHeight: 22, marginTop: 4,
    },

    // Features
    section: { padding: 20, gap: 10 },
    featureRow: {
      flexDirection: 'row', alignItems: 'center', gap: 14,
      backgroundColor: c.surface, borderRadius: 14, padding: 14,
      borderWidth: 1, borderColor: c.border,
      ...shadow.sm,
    },
    featureIcon: {
      width: 44, height: 44, borderRadius: 13,
      backgroundColor: c.primary + '12',
      justifyContent: 'center', alignItems: 'center',
    },
    featureLabel: { fontSize: 14, fontWeight: '700', color: c.text, marginBottom: 2 },
    featureSub: { fontSize: 12, color: c.subtext, lineHeight: 17 },

    // Free badge
    freeBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      marginHorizontal: 20, marginBottom: 24,
      backgroundColor: c.primary + '0d',
      borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
      borderWidth: 1, borderColor: c.primary + '25',
    },
    freeBadgeText: { flex: 1, fontSize: 13, color: c.primary, fontWeight: '500', lineHeight: 18 },

    // Buttons
    btnPrimary: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
      marginHorizontal: 20, paddingVertical: 16,
      backgroundColor: c.primary, borderRadius: 14,
      marginBottom: 12,
      ...shadow.md,
    },
    btnPrimaryText: { fontSize: 16, fontWeight: '700', color: '#fff' },

    btnSecondary: {
      marginHorizontal: 20, paddingVertical: 15,
      borderRadius: 14, borderWidth: 1.5, borderColor: c.primary,
      alignItems: 'center', marginBottom: 20,
    },
    btnSecondaryText: { fontSize: 15, fontWeight: '600', color: c.primary },

    inviteHint: {
      fontSize: 13, color: c.subtext,
      textAlign: 'center', paddingHorizontal: 28, lineHeight: 20,
    },
    inviteLink: { color: c.primary, fontWeight: '600' },
  })
}

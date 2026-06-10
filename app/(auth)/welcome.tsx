import { useMemo } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, StatusBar } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'
import { shadow } from '../../lib/shadows'

const FEATURES = [
  {
    icon: 'calendar-outline' as const,
    label: 'Grafik służb',
    sub: 'Automatyczny plan na cały rok liturgiczny z powiadomieniami push',
  },
  {
    icon: 'location-outline' as const,
    label: 'Weryfikacja obecności',
    sub: 'GPS, kod QR lub potwierdzenie przez opiekuna — w kilka sekund',
  },
  {
    icon: 'trophy-outline' as const,
    label: 'System punktów i rankingi',
    sub: 'Rankingi i historia punktów motywujące do regularnej służby',
  },
  {
    icon: 'chatbubbles-outline' as const,
    label: 'Czat z opiekunem',
    sub: 'Komunikacja wewnątrz grupy — bez zewnętrznych komunikatorów',
  },
]

export default function WelcomeScreen() {
  const router = useRouter()
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0D1764" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <LinearGradient
          colors={['#0D1764', '#1A237E', '#283593']}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.circleTopRight} />
          <View style={styles.circleBottomLeft} />
          <Text style={[styles.crossDecor, styles.crossTopLeft]}>✝</Text>
          <Text style={[styles.crossDecor, styles.crossBottomRight]}>✝</Text>

          <View style={styles.logoWrap}>
            <Ionicons name="shield-half-outline" size={34} color="#fff" />
          </View>

          <Text style={styles.appName}>LSO App</Text>
          <Text style={styles.appFull}>Liturgiczna Służba Ołtarza</Text>
          <Text style={styles.tagline}>
            Cyfrowe narzędzie dla opiekunów i ministrantów
          </Text>

          <TouchableOpacity
            style={styles.btnGold}
            onPress={() => router.push('/(auth)/register')}
            activeOpacity={0.85}
          >
            <Ionicons name="person-add-outline" size={20} color="#0D1764" />
            <Text style={styles.btnGoldText}>Zarejestruj się</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.btnWhite}
            onPress={() => router.push('/(auth)/login')}
            activeOpacity={0.85}
          >
            <Ionicons name="key-outline" size={20} color="#1A237E" />
            <Text style={styles.btnWhiteText}>Zaloguj się</Text>
          </TouchableOpacity>

          <Text style={styles.scrollHint}>↓ POZNAJ FUNKCJE ↓</Text>
        </LinearGradient>

        {/* Features */}
        <View style={styles.section}>
          {FEATURES.map((f, i) => (
            <View key={i} style={styles.featureCard}>
              <View style={styles.featureIconWrap}>
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
          <Ionicons name="heart-outline" size={16} color="#6B5B00" />
          <Text style={styles.freeBadgeText}>
            Bezpłatna aplikacja misyjna — wspierana dobrowolnymi ofiarami
          </Text>
        </View>
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
      paddingTop: 72,
      paddingBottom: 32,
      paddingHorizontal: 24,
      alignItems: 'center',
      overflow: 'hidden',
    },

    // Decorative background elements
    circleTopRight: {
      position: 'absolute', top: -50, right: -50,
      width: 160, height: 160, borderRadius: 80,
      backgroundColor: 'rgba(255,255,255,0.04)',
    },
    circleBottomLeft: {
      position: 'absolute', bottom: -40, left: -40,
      width: 120, height: 120, borderRadius: 60,
      backgroundColor: 'rgba(255,255,255,0.03)',
    },
    crossDecor: {
      position: 'absolute',
      color: '#fff',
    },
    crossTopLeft: {
      top: 18, left: 18,
      fontSize: 38, opacity: 0.05,
      transform: [{ rotate: '-15deg' }],
    },
    crossBottomRight: {
      bottom: 28, right: 14,
      fontSize: 28, opacity: 0.04,
      transform: [{ rotate: '10deg' }],
    },

    // Logo
    logoWrap: {
      width: 76, height: 76, borderRadius: 22,
      backgroundColor: 'rgba(255,255,255,0.12)',
      justifyContent: 'center', alignItems: 'center',
      marginBottom: 14,
      borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
      ...shadow.md,
    },

    appName: {
      fontSize: 30, fontWeight: '900', color: '#fff',
      letterSpacing: 0.5, marginBottom: 4,
    },
    appFull: {
      fontSize: 10, fontWeight: '600',
      color: 'rgba(255,255,255,0.5)',
      letterSpacing: 2.5, textTransform: 'uppercase', marginBottom: 14,
    },
    tagline: {
      fontSize: 13, color: 'rgba(255,255,255,0.82)',
      textAlign: 'center', lineHeight: 22,
      maxWidth: 220, marginBottom: 26,
    },

    // CTAs
    btnGold: {
      flexDirection: 'row', alignItems: 'center',
      justifyContent: 'center', gap: 9,
      width: '100%', paddingVertical: 15,
      backgroundColor: '#FFC107', borderRadius: 14,
      marginBottom: 10,
      ...shadow.md,
    },
    btnGoldText: { fontSize: 14, fontWeight: '800', color: '#0D1764' },

    btnWhite: {
      flexDirection: 'row', alignItems: 'center',
      justifyContent: 'center', gap: 9,
      width: '100%', paddingVertical: 14,
      backgroundColor: '#fff', borderRadius: 14,
      ...shadow.md,
    },
    btnWhiteText: { fontSize: 14, fontWeight: '800', color: '#1A237E' },

    scrollHint: {
      marginTop: 18,
      fontSize: 9, color: 'rgba(255,255,255,0.3)',
      letterSpacing: 1.5, textTransform: 'uppercase',
    },

    // Features section
    section: { backgroundColor: c.bg, padding: 14, gap: 8 },

    featureCard: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 13,
      padding: 13,
      backgroundColor: c.surface,
      borderRadius: 14,
      borderWidth: 1, borderColor: c.border,
      ...shadow.xs,
    },
    featureIconWrap: {
      width: 42, height: 42, borderRadius: 12,
      backgroundColor: c.primarySurface,
      justifyContent: 'center', alignItems: 'center',
      flexShrink: 0,
    },
    featureLabel: { fontSize: 13, fontWeight: '700', color: c.text, marginBottom: 3 },
    featureSub: { fontSize: 11, color: c.subtext, lineHeight: 17 },

    // Free badge
    freeBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      marginHorizontal: 14, marginTop: 4,
      backgroundColor: '#FFF8E1',
      borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
      borderWidth: 1, borderColor: 'rgba(255,193,7,0.3)',
    },
    freeBadgeText: {
      flex: 1, fontSize: 11,
      color: '#6B5B00', fontWeight: '500', lineHeight: 17,
    },
  })
}

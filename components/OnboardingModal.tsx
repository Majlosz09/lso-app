import { useState, useMemo } from 'react'
import {
  View, Text, Modal, TouchableOpacity,
  StyleSheet, Dimensions
} from 'react-native'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useTheme } from '../lib/ThemeContext'
import { Colors } from '../lib/theme'

const { width: SCREEN_WIDTH } = Dimensions.get('window')

interface Slide {
  emoji: string
  title: string
  description: string
}

const MEMBER_SLIDES: Slide[] = [
  {
    emoji: '📅',
    title: 'Grafik służb',
    description: 'Tu znajdziesz swoje nadchodzące służby. Możesz się zapisać na służbę, wypisać lub zgłosić nieobecność. Sprawdzaj co tydzień, aby nie przegapić swojego dyżuru.',
  },
  {
    emoji: '✅',
    title: 'Potwierdzenie obecności',
    description: 'Przy każdej służbie możesz potwierdzić swoją obecność — przyciskiem, skanując kod QR lub przez GPS. Zrób to po przybyciu do kościoła.',
  },
  {
    emoji: '🏆',
    title: 'Punkty i Ranking',
    description: 'Za każdą potwierdzoną służbę zdobywasz punkty. Możesz śledzić swoją historię i porównywać się z innymi ministrantami w parafialnym rankingu.',
  },
  {
    emoji: '📢',
    title: 'Ogłoszenia',
    description: 'Tutaj administrator będzie publikować ważne informacje — zmiany w grafiku, wyjazdy, uroczystości. Sprawdzaj regularnie!',
  },
  {
    emoji: '📚',
    title: 'Wiedza',
    description: 'Znajdziesz tu modlitwy ministranta, słowniczek liturgiczny, życiorysy patronów, ceremoniał oraz strukturę Mszy Świętej. Twój podręczny przewodnik ministranta.',
  },
]

const ADMIN_SLIDES: Slide[] = [
  {
    emoji: '👥',
    title: 'Ministranci',
    description: 'Zarządzasz bazą ministrantów swojej parafii — możesz dodawać, przeglądać profile, przyznawać rangi i śledzić aktywność.',
  },
  {
    emoji: '📅',
    title: 'Grafik służb',
    description: 'Tworzysz grafik — dodajesz służby jednorazowe lub cykliczne, przypisujesz ministrantów i zarządzasz kategoriami (Msza, Nabożeństwo, Zbiórka).',
  },
  {
    emoji: '✅',
    title: 'Zaznaczanie obecności',
    description: 'Po każdej służbie zaznaczasz obecność ministrantów. Możesz też wybrać tryb potwierdzania — przycisk, GPS lub kod QR dla całej parafii.',
  },
  {
    emoji: '🏆',
    title: 'Punkty',
    description: 'System automatycznie przyznaje punkty za potwierdzone służby. Możesz też ręcznie dodawać lub odejmować punkty i śledzić ranking parafii.',
  },
  {
    emoji: '📢',
    title: 'Ogłoszenia',
    description: 'Publikujesz ogłoszenia dla ministrantów i rodziców. Możesz je przypiąć na górze listy, aby ważne informacje były zawsze widoczne.',
  },
]

const PARENT_SLIDES: Slide[] = [
  {
    emoji: '👶',
    title: 'Twoje dzieci',
    description: 'W profilu widzisz listę powiązanych kont dzieci — ich rangę, odznaki i postępy. Możesz kliknąć profil dziecka, aby zobaczyć szczegóły.',
  },
  {
    emoji: '📅',
    title: 'Grafik służb',
    description: 'Śledzisz nadchodzące służby swoich dzieci. Widzisz daty, godziny i status każdego dyżuru, aby zawsze wiedzieć kiedy dziecko służy.',
  },
  {
    emoji: '🏆',
    title: 'Punkty i postępy',
    description: 'Obserwujesz ile punktów i służb zebrało każde z Twoich dzieci. Możesz też zobaczyć ranking całej parafii.',
  },
  {
    emoji: '📢',
    title: 'Ogłoszenia',
    description: 'Tutaj pojawiają się ważne informacje od administratora — zmiany w grafiku, wyjazdy, uroczystości parafialne. Sprawdzaj regularnie!',
  },
  {
    emoji: '📚',
    title: 'Wiedza',
    description: 'Znajdziesz tu modlitwy ministranta, słowniczek liturgiczny, życiorysy patronów i strukturę Mszy Świętej — pomocne materiały dla całej rodziny.',
  },
]

interface Props {
  visible: boolean
  onClose: () => void
}

export function OnboardingModal({ visible, onClose }: Props) {
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])
  const { profile, fetchProfile } = useAuthStore()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [completing, setCompleting] = useState(false)

  const slides = profile?.role === 'admin'
    ? ADMIN_SLIDES
    : profile?.role === 'parent'
      ? PARENT_SLIDES
      : MEMBER_SLIDES

  const isLast = currentIndex === slides.length - 1
  const slide = slides[currentIndex]

  const handleNext = () => {
    if (isLast) {
      handleComplete()
    } else {
      setCurrentIndex(i => i + 1)
    }
  }

  const handleComplete = async () => {
    setCompleting(true)
    if (profile?.id) {
      await supabase
        .from('profiles')
        .update({ onboarding_completed: true })
        .eq('id', profile.id)
      await fetchProfile()
    }
    setCompleting(false)
    setCurrentIndex(0)
    onClose()
  }

  const handleSkip = () => {
    handleComplete()
  }

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={handleSkip}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.slideContent}>
            <Text style={styles.emoji}>{slide.emoji}</Text>
            <Text style={styles.title}>{slide.title}</Text>
            <Text style={styles.description}>{slide.description}</Text>
          </View>

          <View style={styles.dots}>
            {slides.map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i === currentIndex && styles.dotActive]}
              />
            ))}
          </View>

          <View style={styles.buttons}>
            <TouchableOpacity
              style={styles.skipBtn}
              onPress={handleSkip}
              disabled={completing}
            >
              <Text style={styles.skipText}>Pomiń</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.nextBtn, completing && { opacity: 0.6 }]}
              onPress={handleNext}
              disabled={completing}
            >
              <Text style={styles.nextText}>
                {isLast ? 'Zaczynamy!' : 'Dalej →'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    overlay: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'center', alignItems: 'center', padding: 24,
    },
    container: {
      backgroundColor: c.primary, borderRadius: 24,
      padding: 28, width: Math.min(SCREEN_WIDTH - 48, 400),
      gap: 24,
    },
    slideContent: { alignItems: 'center', gap: 12 },
    emoji: { fontSize: 52 },
    title: { fontSize: 22, fontWeight: '800', color: '#fff', textAlign: 'center' },
    description: {
      fontSize: 15, color: 'rgba(255,255,255,0.88)',
      textAlign: 'center', lineHeight: 22,
    },
    dots: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.35)' },
    dotActive: { backgroundColor: '#fff', width: 20 },
    buttons: { flexDirection: 'row', gap: 10 },
    skipBtn: {
      flex: 1, backgroundColor: 'rgba(255,255,255,0.18)',
      borderRadius: 12, paddingVertical: 13, alignItems: 'center',
    },
    skipText: { fontSize: 15, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
    nextBtn: {
      flex: 2, backgroundColor: '#fff',
      borderRadius: 12, paddingVertical: 13, alignItems: 'center',
    },
    nextText: { fontSize: 15, fontWeight: '700', color: c.primary },
  })
}

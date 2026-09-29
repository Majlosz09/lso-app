import { Image, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTheme } from '../../lib/ThemeContext'
import { sans } from '../../lib/theme'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import { AuthLayout } from '../../components/auth/AuthLayout'
import { AppText, Button } from '../../components/ui'

export default function WelcomeScreen() {
  const router = useRouter()
  const isDesktop = useIsDesktop()
  const { colors: c } = useTheme()

  const buttons = (
    <>
      <Button label="Zarejestruj się" variant="gold" onPress={() => router.push('/(auth)/register')} />
      <Button
        label="Zaloguj się"
        variant={isDesktop ? 'secondary' : 'outlineLight'}
        onPress={() => router.push('/(auth)/login')}
      />
      <AppText style={[styles.free, { color: isDesktop ? c.subtext : '#8497B5' }]}>
        Bezpłatna aplikacja misyjna — wspierana dobrowolnymi ofiarami
      </AppText>
    </>
  )

  if (isDesktop) {
    return (
      <AuthLayout title="Szczęść Boże!" subtitle="Zaloguj się do swojej parafii albo dołącz kodem od opiekuna." footer={buttons}>
        {null}
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      variant="hero"
      title="Służba przy ołtarzu,"
      titleAccent="poukładana."
      subtitle="Grafik dyżurów, obecność, punkty i czat parafii — dla ministrantów, opiekunów i rodziców."
      heroTop={
        <View style={styles.heroTop}>
          <Image source={require('../../assets/images/icon.png')} style={styles.logo} />
          <AppText variant="eyebrow" color={c.gold} style={styles.eyebrow}>Liturgiczna Służba Ołtarza</AppText>
        </View>
      }
      footer={buttons}
    >
      {null}
    </AuthLayout>
  )
}

const styles = StyleSheet.create({
  heroTop: { gap: 18 },
  logo: { width: 84, height: 84, borderRadius: 22 },
  eyebrow: { letterSpacing: 1.6 },
  free: { ...sans(500), fontSize: 12, textAlign: 'center', marginTop: 4 },
})

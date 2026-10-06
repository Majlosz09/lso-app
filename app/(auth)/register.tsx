import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'
import Toast from 'react-native-toast-message'
import { useRouter } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../lib/ThemeContext'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import { sans } from '../../lib/theme'
import { AuthDivider, AuthLayout } from '../../components/auth/AuthLayout'
import {
  ChoiceCard, ConsentCheckbox, LegalLink, PasswordField, WebFormWrapper,
} from '../../components/auth/formParts'
import { AppText, Button, Chip, Icon, TextField } from '../../components/ui'

type Step = 'choose' | 'member' | 'admin'
type MemberRole = 'member' | 'parent'

// Alert.alert nie wyświetla się na webie (react-native-web) — Toast działa wszędzie
function showError(title: string, message?: string) {
  Toast.show({ type: 'error', text1: title, text2: message })
}

const TERMS_URL = 'https://lsoapp.com/regulamin'
const PRIVACY_URL = 'https://lsoapp.com/privacy'

export default function RegisterScreen() {
  const [step, setStep] = useState<Step>('choose')

  if (step === 'member') return <MemberForm onBack={() => setStep('choose')} />
  if (step === 'admin') return <AdminForm onBack={() => setStep('choose')} />
  return <ChooseScreen onMember={() => setStep('member')} onAdmin={() => setStep('admin')} />
}

function ChooseScreen({ onMember, onAdmin }: { onMember: () => void; onAdmin: () => void }) {
  const router = useRouter()
  const { colors: c } = useTheme()
  const isDesktop = useIsDesktop()
  return (
    <AuthLayout
      variant="hero"
      title="Dołącz do"
      titleAccent="parafii"
      subtitle="Liturgiczna Służba Ołtarza"
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/(auth)/welcome'))}
    >
      <View style={styles.cards}>
        <ChoiceCard
          icon="account-group"
          title="Jestem ministrantem lub rodzicem"
          subtitle="Dołącz do parafii za pomocą kodu zaproszenia"
          onPress={onMember}
        />
        <ChoiceCard
          icon="church"
          tone={isDesktop ? 'light' : 'navy'}
          title="Tworzę parafię"
          subtitle="Administrator / ksiądz — nowa parafia w systemie"
          onPress={onAdmin}
        />
      </View>
      <Pressable onPress={() => router.replace('/(auth)/login')} accessibilityRole="link" style={styles.loginLink}>
        <AppText style={[styles.loginLinkText, { color: isDesktop ? c.subtext : '#C9D3E3' }]}>
          Masz już konto? <AppText style={[styles.loginLinkStrong, { color: isDesktop ? c.primary : c.gold }]}>Zaloguj się</AppText>
        </AppText>
      </Pressable>
    </AuthLayout>
  )
}

function MemberForm({ onBack }: { onBack: () => void }) {
  const { setSession } = useAuthStore()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<MemberRole>('member')
  const [phone, setPhone] = useState('')
  const [rocznik, setRocznik] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  // kod osobisty od księdza (ministrant dodany przez parafię bez konta) — przejmie dyżury i punkty
  const [personalCode, setPersonalCode] = useState('')
  const [personalInfo, setPersonalInfo] = useState<{ full_name: string; parish: string } | null>(null)
  const onPersonalCode = async (t: string) => {
    const v = t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
    setPersonalCode(v)
    setPersonalInfo(null)
    if (v.length !== 8) return
    const { data } = await supabase.rpc('claim_code_info', { p_code: v })
    const info = data as any
    if (!info) return
    setPersonalInfo({ full_name: info.full_name, parish: info.parish })
    setInviteCode(String(info.invite_code ?? '').toUpperCase())
    const [first, ...rest] = String(info.full_name).split(' ')
    if (!firstName.trim()) setFirstName(first)
    if (!lastName.trim()) setLastName(rest.join(' '))
    if (!rocznik && info.rocznik) setRocznik(String(info.rocznik))
  }
  const [loading, setLoading] = useState(false)

  const [parishIdPreview, setParishIdPreview] = useState<string | null>(null)
  const [membersList, setMembersList] = useState<{ id: string; full_name: string }[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [selectedChildIds, setSelectedChildIds] = useState<string[]>([])
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [parentConsent, setParentConsent] = useState(false)
  // Poniżej 16 lat: zgoda rodzica/opiekuna (art. 8 RODO, polska granica wieku)
  const isMinor = role === 'member' && rocznik.length === 4 && new Date().getFullYear() - parseInt(rocznik) < 16

  const { colors: c } = useTheme()

  useEffect(() => {
    if (role !== 'parent' || inviteCode.length !== 6) {
      setMembersList([]); setParishIdPreview(null); setSelectedChildIds([]); return
    }
    setLoadingMembers(true)
    // Przed rejestracją widać tylko imię + inicjał nazwiska i rocznik (ochrona danych dzieci)
    supabase.rpc('get_parish_children_by_code', { code: inviteCode }).then(({ data }) => {
      const kids = (data ?? []) as { id: string; display_name: string; rocznik: number | null }[]
      setParishIdPreview(kids.length ? inviteCode : null)
      setMembersList(kids.map(k => ({ id: k.id, full_name: k.rocznik ? `${k.display_name} (${k.rocznik})` : k.display_name })))
      setLoadingMembers(false)
    })
  }, [inviteCode, role])

  const toggleChild = (id: string) =>
    setSelectedChildIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const validate = () => {
    if (!firstName.trim()) return 'Wpisz imię.'
    if (!lastName.trim()) return 'Wpisz nazwisko.'
    if (!email.includes('@')) return 'Podaj poprawny email.'
    if (password.length < 8) return 'Hasło musi mieć minimum 8 znaków.'
    if (!phone.trim()) return 'Wpisz numer telefonu.'
    if (role === 'member') {
      const yr = parseInt(rocznik)
      if (!rocznik || yr < 1990) return 'Podaj poprawny rocznik (np. 2018).'
    }
    if (inviteCode.trim().length !== 6) return 'Wpisz 6-znakowy kod parafii.'
    if (!acceptTerms) return 'Zaakceptuj regulamin, aby kontynuować.'
    if (isMinor && !parentConsent) return 'Osoba poniżej 16 lat potrzebuje zgody rodzica lub opiekuna.'
    return null
  }

  const handleSubmit = async () => {
    if (loading) return
    const err = validate()
    if (err) { showError('Błąd', err); return }

    setLoading(true)
    // Metadane trafiają do profilu przez trigger handle_new_user — profil jest kompletny
    // nawet gdy sesja powstaje dopiero po potwierdzeniu maila
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: `${firstName.trim()} ${lastName.trim()}`,
          role,
          phone: phone.trim(),
          rocznik: role === 'member' ? rocznik : null,
          invite_code: inviteCode.trim().toUpperCase(),
        },
      },
    })
    if (error || !data.user) {
      const isAlreadyRegistered =
        (error as any)?.status === 422 ||
        error?.message?.toLowerCase().includes('already registered') ||
        error?.message?.toLowerCase().includes('user already registered')
      showError(
        'Błąd rejestracji',
        isAlreadyRegistered
          ? 'Ten adres email jest już zarejestrowany. Zaloguj się zamiast tego.'
          : (error?.message ?? 'Nieznany błąd')
      )
      setLoading(false)
      return
    }

    let activeSession = data.session
    if (!activeSession) {
      const { data: signInData, error: loginErr } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (loginErr || !signInData.session) {
        Toast.show({ type: 'info', text1: 'Potwierdź adres e-mail', text2: 'Wysłaliśmy link na Twój e-mail. Po potwierdzeniu zaloguj się — dane z formularza są zapisane.' })
        setLoading(false)
        return
      }
      activeSession = signInData.session
    }

    const { data: parishId, error: rpcError } = await supabase
      .rpc('get_parish_by_invite_code', { code: inviteCode.trim().toUpperCase() })

    if (rpcError || !parishId) {
      showError('Błąd', 'Nieznany kod parafii. Sprawdź kod i spróbuj ponownie.')
      setLoading(false)
      return
    }

    const { error: profileError } = await supabase.from('profiles').upsert({
      id: data.user.id,
      full_name: `${firstName.trim()} ${lastName.trim()}`,
      role,
      phone: phone.trim(),
      rocznik: role === 'member' ? parseInt(rocznik) : null,
      is_active: true,
      parish_id: parishId,
    })

    if (profileError) {
      setLoading(false)
      showError('Błąd profilu', profileError.message)
      return
    }

    if (role === 'parent' && selectedChildIds.length > 0) {
      await supabase.rpc('link_parent_to_children', { p_child_ids: selectedChildIds })
    }

    // kod osobisty: konto przejmuje profil założony przez parafię (od razu zatwierdzone)
    if (role === 'member' && personalInfo && personalCode.length === 8) {
      const { error: claimErr } = await supabase.rpc('claim_member_profile', { p_code: personalCode })
      if (!claimErr) {
        Toast.show({ type: 'success', text1: 'Witaj w służbie!', text2: 'Twoje dyżury i punkty są już na koncie.' })
        await useAuthStore.getState().fetchProfile()
        setSession(activeSession)
        return
      }
      Toast.show({ type: 'error', text1: 'Nie udało się użyć kodu osobistego', text2: claimErr.message })
    }

    Toast.show({ type: 'success', text1: 'Konto utworzone', text2: 'Administrator parafii musi jeszcze zatwierdzić Twoje dołączenie.' })
    setSession(activeSession)
  }

  const codeComplete = inviteCode.length === 6

  return (
    <AuthLayout title="Dołącz do parafii" subtitle="Kod dostaniesz od opiekuna ministrantów." onBack={onBack}>
      <WebFormWrapper onSubmit={handleSubmit}>
        <View style={styles.group}>
          <AppText variant="label" muted>Kim jesteś?</AppText>
          <ChoiceCard
            icon="account"
            title="Ministrant"
            subtitle="Służę przy ołtarzu"
            selected={role === 'member'}
            onPress={() => setRole('member')}
          />
          <ChoiceCard
            icon="human-male-female-child"
            title="Rodzic"
            subtitle="Śledzę dyżury i punkty dziecka"
            selected={role === 'parent'}
            onPress={() => setRole('parent')}
          />
        </View>

        {role === 'member' && (
          <TextField
            label="Kod osobisty od księdza (jeśli dostałeś)"
            placeholder="np. ABCD-2345"
            autoCapitalize="characters"
            value={personalCode.length > 4 ? `${personalCode.slice(0, 4)}-${personalCode.slice(4)}` : personalCode}
            onChangeText={onPersonalCode}
            maxLength={9}
            hint={personalInfo ? `${personalInfo.full_name} · ${personalInfo.parish} — Twoje dyżury i punkty przejdą na konto.`
              : personalCode.length === 8 ? 'Nie znamy tego kodu — sprawdź albo zostaw puste.' : undefined}
            hintTone={personalInfo ? 'success' : 'danger'}
          />
        )}

        <TextField
          label="Kod parafii"
          placeholder="6-znakowy kod (np. AB12CD)"
          autoCapitalize="characters"
          value={inviteCode}
          onChangeText={t => setInviteCode(t.toUpperCase())}
          maxLength={6}
          style={styles.code}
          hint={codeComplete ? 'Kod ma poprawną długość — sprawdzimy go przy zapisie.' : undefined}
          hintTone="success"
        />

        {role === 'parent' && codeComplete && (
          <View style={styles.group}>
            <AppText variant="label" muted>Twoje dziecko (opcjonalnie)</AppText>
            {loadingMembers ? (
              <ActivityIndicator color={c.primary} />
            ) : membersList.length === 0 ? (
              <View style={[styles.empty, { borderColor: c.inputBorder }]}>
                <Icon name="account-group" size={18} color={c.textTertiary} />
                <AppText variant="small" muted>Brak ministrantów w parafii o tym kodzie</AppText>
              </View>
            ) : (
              <View style={styles.chips}>
                {membersList.map(m => (
                  <Chip
                    key={m.id}
                    label={m.full_name}
                    selected={selectedChildIds.includes(m.id)}
                    onPress={() => toggleChild(m.id)}
                  />
                ))}
              </View>
            )}
          </View>
        )}

        <View style={styles.row}>
          <TextField label="Imię" placeholder="Imię" value={firstName} onChangeText={setFirstName} containerStyle={styles.flex} autoComplete="given-name" />
          <TextField label="Nazwisko" placeholder="Nazwisko" value={lastName} onChangeText={setLastName} containerStyle={styles.flex} autoComplete="family-name" />
        </View>
        <TextField
          label="E-mail" placeholder="Email" autoCapitalize="none" keyboardType="email-address"
          autoComplete="email" value={email} onChangeText={setEmail}
        />
        <PasswordField label="Hasło" placeholder="Min. 8 znaków" autoComplete="new-password" value={password} onChangeText={setPassword} />
        <View style={styles.row}>
          <TextField
            label="Telefon" placeholder="Numer telefonu" keyboardType="phone-pad" autoComplete="tel"
            value={phone} onChangeText={setPhone} containerStyle={styles.flex}
          />
          {role === 'member' && (
            <TextField
              label="Rocznik" placeholder="np. 2014" keyboardType="number-pad"
              value={rocznik} onChangeText={setRocznik} maxLength={4} containerStyle={styles.rocznik}
            />
          )}
        </View>

        <ConsentCheckbox checked={acceptTerms} onToggle={() => setAcceptTerms(v => !v)}>
          Akceptuję <LegalLink url={TERMS_URL} label="Regulamin" /> i zapoznałem/-am się
          z <LegalLink url={PRIVACY_URL} label="Polityką prywatności" />.
        </ConsentCheckbox>
        {isMinor && (
          <ConsentCheckbox checked={parentConsent} onToggle={() => setParentConsent(v => !v)}>
            Mam mniej niż 16 lat — mój rodzic lub opiekun prawny wie o założeniu konta i się na to zgadza.
          </ConsentCheckbox>
        )}

        <Button label="Wyślij zgłoszenie" onPress={handleSubmit} loading={loading} />
      </WebFormWrapper>
    </AuthLayout>
  )
}

function AdminForm({ onBack }: { onBack: () => void }) {
  const { setSession } = useAuthStore()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [parishName, setParishName] = useState('')
  const [parishCity, setParishCity] = useState('')
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [authorized, setAuthorized] = useState(false)
  const [loading, setLoading] = useState(false)

  const validate = () => {
    if (!firstName.trim()) return 'Wpisz imię.'
    if (!lastName.trim()) return 'Wpisz nazwisko.'
    if (!email.includes('@')) return 'Podaj poprawny email.'
    if (password.length < 8) return 'Hasło musi mieć minimum 8 znaków.'
    if (!phone.trim()) return 'Wpisz numer telefonu.'
    if (!parishName.trim()) return 'Wpisz nazwę parafii.'
    if (!acceptTerms) return 'Zaakceptuj regulamin, aby kontynuować.'
    if (!authorized) return 'Potwierdź, że działasz w imieniu parafii.'
    return null
  }

  const handleSubmit = async () => {
    if (loading) return
    const err = validate()
    if (err) { showError('Błąd', err); return }

    setLoading(true)
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: `${firstName.trim()} ${lastName.trim()}`,
          phone: phone.trim(),
          // parafię utworzy ekran parish-setup po potwierdzeniu maila (podpowiada te wartości)
          parish_name: parishName.trim(),
          parish_city: parishCity.trim(),
        },
      },
    })
    if (error || !data.user) {
      const isAlreadyRegistered =
        (error as any)?.status === 422 ||
        error?.message?.toLowerCase().includes('already registered') ||
        error?.message?.toLowerCase().includes('user already registered')
      showError(
        'Błąd rejestracji',
        isAlreadyRegistered
          ? 'Ten adres email jest już zarejestrowany. Zaloguj się zamiast tego.'
          : (error?.message ?? 'Nieznany błąd')
      )
      setLoading(false)
      return
    }

    let activeSession = data.session
    if (!activeSession) {
      const { data: signInData, error: loginErr } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (loginErr || !signInData.session) {
        Toast.show({ type: 'info', text1: 'Potwierdź adres e-mail', text2: 'Wysłaliśmy link na Twój e-mail. Po potwierdzeniu zaloguj się — dane z formularza są zapisane.' })
        setLoading(false)
        return
      }
      activeSession = signInData.session
    }

    const { data: parishData, error: parishError } = await supabase
      .from('parishes')
      .insert({ name: parishName.trim(), city: parishCity.trim() || null, created_by: data.user.id })
      .select('id')
      .single()

    if (parishError || !parishData) {
      showError('Błąd', 'Nie udało się utworzyć parafii: ' + (parishError?.message ?? 'Nieznany błąd'))
      setLoading(false)
      return
    }

    const { error: profileError } = await supabase.from('profiles').upsert({
      id: data.user.id,
      full_name: `${firstName.trim()} ${lastName.trim()}`,
      role: 'admin',
      phone: phone.trim(),
      is_active: true,
      parish_id: parishData.id,
    })

    if (profileError) {
      setLoading(false)
      showError('Błąd profilu', profileError.message)
      return
    }

    Toast.show({ type: 'success', text1: 'Parafia utworzona!', text2: 'Konto administratora zostało aktywowane.' })
    setSession(activeSession)
  }

  return (
    <AuthLayout title="Nowa parafia" subtitle="Administrator / ksiądz" onBack={onBack}>
      <WebFormWrapper onSubmit={handleSubmit}>
        <View style={styles.row}>
          <TextField label="Imię" placeholder="Imię" value={firstName} onChangeText={setFirstName} containerStyle={styles.flex} autoComplete="given-name" />
          <TextField label="Nazwisko" placeholder="Nazwisko" value={lastName} onChangeText={setLastName} containerStyle={styles.flex} autoComplete="family-name" />
        </View>
        <TextField
          label="E-mail" placeholder="Email" autoCapitalize="none" keyboardType="email-address"
          autoComplete="email" value={email} onChangeText={setEmail}
        />
        <PasswordField label="Hasło" placeholder="Min. 8 znaków" autoComplete="new-password" value={password} onChangeText={setPassword} />
        <TextField label="Telefon" placeholder="Numer telefonu" keyboardType="phone-pad" autoComplete="tel" value={phone} onChangeText={setPhone} />

        <AuthDivider label="Dane parafii" />

        <TextField label="Nazwa parafii *" placeholder="np. Parafia św. Michała Archanioła" value={parishName} onChangeText={setParishName} />
        <TextField label="Miejscowość (opcjonalnie)" placeholder="Miejscowość" value={parishCity} onChangeText={setParishCity} />
        <AppText variant="small" muted>
          Metody obecności, rozkład Mszy i punktację ustawisz w następnym kroku.
        </AppText>

        <ConsentCheckbox checked={acceptTerms} onToggle={() => setAcceptTerms(v => !v)}>
          Akceptuję <LegalLink url={TERMS_URL} label="Regulamin" /> (w tym zasady powierzenia
          przetwarzania danych) i zapoznałem/-am się z <LegalLink url={PRIVACY_URL} label="Polityką prywatności" />.
        </ConsentCheckbox>
        <ConsentCheckbox checked={authorized} onToggle={() => setAuthorized(v => !v)}>
          Oświadczam, że zakładam grupę LSO za wiedzą i zgodą proboszcza parafii i będę dbać
          o zgody rodziców niepełnoletnich ministrantów.
        </ConsentCheckbox>

        <Button label="Utwórz parafię" onPress={handleSubmit} loading={loading} />
      </WebFormWrapper>
    </AuthLayout>
  )
}

const styles = StyleSheet.create({
  cards: { gap: 12, marginTop: 10 },
  loginLink: { alignSelf: 'center', marginTop: 12, cursor: 'pointer' } as any,
  loginLinkText: { ...sans(500), fontSize: 13 },
  loginLinkStrong: { ...sans(800), fontSize: 13 },
  group: { gap: 8 },
  row: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
  rocznik: { width: 110 },
  code: { ...sans(800), letterSpacing: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  empty: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed' },
})

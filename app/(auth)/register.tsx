import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView
} from 'react-native'
import { Link } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { shadow } from '../../lib/shadows'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'

type Step = 'choose' | 'member' | 'admin'
type MemberRole = 'member' | 'parent'

export default function RegisterScreen() {
  const [step, setStep] = useState<Step>('choose')

  if (step === 'member') return <MemberForm onBack={() => setStep('choose')} />
  if (step === 'admin') return <AdminForm onBack={() => setStep('choose')} />
  return <ChooseScreen onMember={() => setStep('member')} onAdmin={() => setStep('admin')} />
}

function ChooseScreen({ onMember, onAdmin }: { onMember: () => void; onAdmin: () => void }) {
  return (
    <View style={styles.chooseContainer}>
      <View style={styles.chooseInner}>
        <View style={styles.logoWrapper}>
          <Ionicons name="shield-half-outline" size={52} color="#534AB7" />
        </View>
        <Text style={styles.chooseTitle}>Dołącz do parafii</Text>
        <Text style={styles.chooseSub}>Liturgiczna Służba Ołtarza</Text>

        <View style={styles.cardsWrapper}>
          <TouchableOpacity style={styles.chooseCard} onPress={onMember} activeOpacity={0.75}>
            <View style={[styles.cardIcon, { backgroundColor: '#534AB711' }]}>
              <Ionicons name="person-add-outline" size={28} color="#534AB7" />
            </View>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>Jestem ministrantem lub rodzicem</Text>
              <Text style={styles.cardSub}>Dołącz do parafii za pomocą kodu zaproszenia</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#ccc" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.chooseCard} onPress={onAdmin} activeOpacity={0.75}>
            <View style={[styles.cardIcon, { backgroundColor: '#27ae6011' }]}>
              <Ionicons name="business-outline" size={28} color="#27ae60" />
            </View>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>Tworzę parafię</Text>
              <Text style={styles.cardSub}>Administrator / ksiądz — nowa parafia w systemie</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#ccc" />
          </TouchableOpacity>
        </View>

        <Link href="/(auth)/login" style={styles.loginLink}>
          Masz już konto? Zaloguj się
        </Link>
      </View>
    </View>
  )
}

function MemberForm({ onBack }: { onBack: () => void }) {
  const { fetchProfile } = useAuthStore()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<MemberRole>('member')
  const [phone, setPhone] = useState('')
  const [rocznik, setRocznik] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [loading, setLoading] = useState(false)

  const validate = () => {
    if (!firstName.trim()) return 'Wpisz imię.'
    if (!lastName.trim()) return 'Wpisz nazwisko.'
    if (!email.includes('@')) return 'Podaj poprawny email.'
    if (password.length < 6) return 'Hasło musi mieć minimum 6 znaków.'
    if (!phone.trim()) return 'Wpisz numer telefonu.'
    if (role === 'member') {
      const yr = parseInt(rocznik)
      if (!rocznik || yr < 1990 || yr > new Date().getFullYear()) return 'Podaj poprawny rocznik (np. 2018).'
    }
    if (inviteCode.trim().length !== 6) return 'Wpisz 6-znakowy kod parafii.'
    return null
  }

  const handleSubmit = async () => {
    const err = validate()
    if (err) { Alert.alert('Błąd', err); return }

    setLoading(true)
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password })
    if (error || !data.user) {
      Alert.alert('Błąd rejestracji', error?.message ?? 'Nieznany błąd')
      setLoading(false)
      return
    }

    if (!data.session) {
      const { error: loginErr } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (loginErr) {
        Alert.alert('Błąd', 'Sprawdź email i potwierdź konto, a następnie zaloguj się.')
        setLoading(false)
        return
      }
    }

    const { data: parishId, error: rpcError } = await supabase
      .rpc('get_parish_by_invite_code', { code: inviteCode.trim().toUpperCase() })

    if (rpcError || !parishId) {
      Alert.alert('Błąd', 'Nieznany kod parafii. Sprawdź kod i spróbuj ponownie.')
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

    setLoading(false)
    if (profileError) { Alert.alert('Błąd profilu', profileError.message); return }
    await fetchProfile()
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView style={styles.formContainer} contentContainerStyle={styles.formInner} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Ionicons name="arrow-back-outline" size={20} color="#534AB7" />
          <Text style={styles.backBtnText}>Wróć</Text>
        </TouchableOpacity>

        <Text style={styles.formTitle}>Rejestracja</Text>
        <Text style={styles.formSub}>Ministrant lub rodzic</Text>

        <View style={styles.nameRow}>
          <TextInput style={[styles.input, { flex: 1 }]} placeholder="Imię" placeholderTextColor="#999"
            value={firstName} onChangeText={setFirstName} />
          <TextInput style={[styles.input, { flex: 1 }]} placeholder="Nazwisko" placeholderTextColor="#999"
            value={lastName} onChangeText={setLastName} />
        </View>

        <TextInput style={styles.input} placeholder="Email" placeholderTextColor="#999"
          autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
        <TextInput style={styles.input} placeholder="Hasło (min. 6 znaków)" placeholderTextColor="#999"
          secureTextEntry value={password} onChangeText={setPassword} />

        <Text style={styles.label}>Rola</Text>
        <View style={styles.roleRow}>
          {([{ key: 'member', label: 'Ministrant' }, { key: 'parent', label: 'Rodzic' }] as { key: MemberRole; label: string }[]).map(r => (
            <TouchableOpacity key={r.key} style={[styles.roleChip, role === r.key && styles.roleChipActive]}
              onPress={() => setRole(r.key)}>
              <Text style={[styles.roleChipText, role === r.key && styles.roleChipTextActive]}>{r.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TextInput style={styles.input} placeholder="Numer telefonu" placeholderTextColor="#999"
          keyboardType="phone-pad" value={phone} onChangeText={setPhone} />

        {role === 'member' && (
          <TextInput style={styles.input} placeholder="Rocznik ministranta (np. 2018)" placeholderTextColor="#999"
            keyboardType="number-pad" value={rocznik} onChangeText={setRocznik} maxLength={4} />
        )}

        <Text style={styles.label}>Kod parafii</Text>
        <View style={styles.codeInputWrapper}>
          <Ionicons name="key-outline" size={18} color="#aaa" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.codeInput}
            placeholder="6-znakowy kod (np. AB12CD)"
            placeholderTextColor="#999"
            autoCapitalize="characters"
            value={inviteCode}
            onChangeText={t => setInviteCode(t.toUpperCase())}
            maxLength={6}
          />
          {inviteCode.length === 6 && (
            <Ionicons name="checkmark-circle" size={20} color="#27ae60" />
          )}
        </View>

        <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={handleSubmit} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Zarejestruj się</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

function AdminForm({ onBack }: { onBack: () => void }) {
  const { fetchProfile } = useAuthStore()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [parishName, setParishName] = useState('')
  const [parishCity, setParishCity] = useState('')
  const [loading, setLoading] = useState(false)

  const validate = () => {
    if (!firstName.trim()) return 'Wpisz imię.'
    if (!lastName.trim()) return 'Wpisz nazwisko.'
    if (!email.includes('@')) return 'Podaj poprawny email.'
    if (password.length < 6) return 'Hasło musi mieć minimum 6 znaków.'
    if (!phone.trim()) return 'Wpisz numer telefonu.'
    if (!parishName.trim()) return 'Wpisz nazwę parafii.'
    return null
  }

  const handleSubmit = async () => {
    const err = validate()
    if (err) { Alert.alert('Błąd', err); return }

    setLoading(true)
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password })
    if (error || !data.user) {
      Alert.alert('Błąd rejestracji', error?.message ?? 'Nieznany błąd')
      setLoading(false)
      return
    }

    if (!data.session) {
      const { error: loginErr } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (loginErr) {
        Alert.alert('Błąd', 'Sprawdź email i potwierdź konto, a następnie zaloguj się.')
        setLoading(false)
        return
      }
    }

    const { data: parishData, error: parishError } = await supabase
      .from('parishes')
      .insert({ name: parishName.trim(), city: parishCity.trim() || null, created_by: data.user.id })
      .select('id')
      .single()

    if (parishError || !parishData) {
      Alert.alert('Błąd', 'Nie udało się utworzyć parafii: ' + (parishError?.message ?? 'Nieznany błąd'))
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

    setLoading(false)
    if (profileError) { Alert.alert('Błąd profilu', profileError.message); return }
    await fetchProfile()
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView style={styles.formContainer} contentContainerStyle={styles.formInner} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Ionicons name="arrow-back-outline" size={20} color="#534AB7" />
          <Text style={styles.backBtnText}>Wróć</Text>
        </TouchableOpacity>

        <Text style={styles.formTitle}>Nowa parafia</Text>
        <Text style={styles.formSub}>Administrator / ksiądz</Text>

        <View style={styles.nameRow}>
          <TextInput style={[styles.input, { flex: 1 }]} placeholder="Imię" placeholderTextColor="#999"
            value={firstName} onChangeText={setFirstName} />
          <TextInput style={[styles.input, { flex: 1 }]} placeholder="Nazwisko" placeholderTextColor="#999"
            value={lastName} onChangeText={setLastName} />
        </View>

        <TextInput style={styles.input} placeholder="Email" placeholderTextColor="#999"
          autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
        <TextInput style={styles.input} placeholder="Hasło (min. 6 znaków)" placeholderTextColor="#999"
          secureTextEntry value={password} onChangeText={setPassword} />
        <TextInput style={styles.input} placeholder="Numer telefonu" placeholderTextColor="#999"
          keyboardType="phone-pad" value={phone} onChangeText={setPhone} />

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>Dane parafii</Text>
          <View style={styles.dividerLine} />
        </View>

        <TextInput style={styles.input} placeholder="Nazwa parafii *" placeholderTextColor="#999"
          value={parishName} onChangeText={setParishName} />
        <TextInput style={styles.input} placeholder="Miejscowość (opcjonalnie)" placeholderTextColor="#999"
          value={parishCity} onChangeText={setParishCity} />

        <TouchableOpacity style={[styles.button, { backgroundColor: '#27ae60' }, loading && styles.buttonDisabled]}
          onPress={handleSubmit} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Utwórz parafię</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  // ── Ekran wyboru ──────────────────────────────────────────
  chooseContainer: { flex: 1, backgroundColor: '#f5f5f5' },
  chooseInner: { flex: 1, justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 48 },

  logoWrapper: {
    width: 88, height: 88, borderRadius: 28,
    backgroundColor: '#534AB711', justifyContent: 'center', alignItems: 'center',
    alignSelf: 'center', marginBottom: 20,
  },
  chooseTitle: { fontSize: 30, fontWeight: '800', textAlign: 'center', color: '#1a1a2e', marginBottom: 6 },
  chooseSub: { fontSize: 14, textAlign: 'center', color: '#888', marginBottom: 36 },

  cardsWrapper: { gap: 14, marginBottom: 36 },
  chooseCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#fff', borderRadius: 16, padding: 18,
    borderWidth: 1, borderColor: '#e8e8e8',
    ...shadow.md,
  },
  cardIcon: {
    width: 52, height: 52, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center',
  },
  cardText: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#1a1a1a', marginBottom: 3 },
  cardSub: { fontSize: 12, color: '#888', lineHeight: 17 },

  loginLink: { textAlign: 'center', color: '#534AB7', fontSize: 14 },

  // ── Formularz ─────────────────────────────────────────────
  formContainer: { flex: 1, backgroundColor: '#f5f5f5' },
  formInner: { paddingHorizontal: 28, paddingTop: 56, paddingBottom: 40 },

  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 24 },
  backBtnText: { fontSize: 15, color: '#534AB7', fontWeight: '500' },

  formTitle: { fontSize: 28, fontWeight: '800', color: '#1a1a2e', marginBottom: 4 },
  formSub: { fontSize: 14, color: '#888', marginBottom: 24 },

  nameRow: { flexDirection: 'row', gap: 10 },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6, marginTop: 4 },

  roleRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  roleChip: {
    flex: 1, paddingVertical: 11, borderRadius: 12,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e0e0e0', alignItems: 'center',
  },
  roleChipActive: { backgroundColor: '#534AB7', borderColor: '#534AB7' },
  roleChipText: { fontSize: 14, fontWeight: '500', color: '#555' },
  roleChipTextActive: { color: '#fff', fontWeight: '600' },

  input: {
    backgroundColor: '#fff', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16, marginBottom: 12,
    borderWidth: 1, borderColor: '#e0e0e0', color: '#1a1a1a',
  },

  codeInputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    borderWidth: 1, borderColor: '#e0e0e0', marginBottom: 12,
  },
  codeInput: { flex: 1, fontSize: 16, color: '#1a1a1a', letterSpacing: 2 },

  divider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#e0e0e0' },
  dividerText: { fontSize: 12, fontWeight: '600', color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.8 },

  button: {
    backgroundColor: '#534AB7', borderRadius: 12,
    paddingVertical: 16, alignItems: 'center', marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
})

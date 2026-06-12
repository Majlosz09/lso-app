import { useEffect, useState, useMemo } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView
} from 'react-native'
import Toast from 'react-native-toast-message'
import { Link } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { shadow } from '../../lib/shadows'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useTheme } from '../../lib/ThemeContext'
import { Colors } from '../../lib/theme'

type Step = 'choose' | 'member' | 'admin'
type MemberRole = 'member' | 'parent'

export default function RegisterScreen() {
  const [step, setStep] = useState<Step>('choose')

  if (step === 'member') return <MemberForm onBack={() => setStep('choose')} />
  if (step === 'admin') return <AdminForm onBack={() => setStep('choose')} />
  return <ChooseScreen onMember={() => setStep('member')} onAdmin={() => setStep('admin')} />
}

function ChooseScreen({ onMember, onAdmin }: { onMember: () => void; onAdmin: () => void }) {
  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])

  return (
    <View style={styles.chooseContainer}>
      <View style={styles.chooseInner}>
        <View style={styles.logoWrapper}>
          <Ionicons name="shield-half-outline" size={52} color={c.primary} />
        </View>
        <Text style={styles.chooseTitle}>Dołącz do parafii</Text>
        <Text style={styles.chooseSub}>Liturgiczna Służba Ołtarza</Text>

        <View style={styles.cardsWrapper}>
          <TouchableOpacity style={styles.chooseCard} onPress={onMember} activeOpacity={0.75}>
            <View style={[styles.cardIcon, { backgroundColor: c.primary + '11' }]}>
              <Ionicons name="person-add-outline" size={28} color={c.primary} />
            </View>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>Jestem ministrantem lub rodzicem</Text>
              <Text style={styles.cardSub}>Dołącz do parafii za pomocą kodu zaproszenia</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={c.iconMuted} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.chooseCard} onPress={onAdmin} activeOpacity={0.75}>
            <View style={[styles.cardIcon, { backgroundColor: '#16A34A11' }]}>
              <Ionicons name="business-outline" size={28} color="#16A34A" />
            </View>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>Tworzę parafię</Text>
              <Text style={styles.cardSub}>Administrator / ksiądz — nowa parafia w systemie</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={c.iconMuted} />
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
  const [showPassword, setShowPassword] = useState(false)

  const [parishIdPreview, setParishIdPreview] = useState<string | null>(null)
  const [membersList, setMembersList] = useState<{ id: string; full_name: string }[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [selectedChildIds, setSelectedChildIds] = useState<string[]>([])

  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])

  useEffect(() => {
    if (role !== 'parent' || inviteCode.length !== 6) {
      setMembersList([]); setParishIdPreview(null); setSelectedChildIds([]); return
    }
    setLoadingMembers(true)
    supabase.rpc('get_parish_by_invite_code', { code: inviteCode }).then(async ({ data: pid }) => {
      if (!pid) { setMembersList([]); setParishIdPreview(null); setLoadingMembers(false); return }
      setParishIdPreview(pid)
      const { data } = await supabase.rpc('get_parish_members', { p_parish_id: pid })
      setMembersList(data ?? [])
      setLoadingMembers(false)
    })
  }, [inviteCode, role])

  const toggleChild = (id: string) =>
    setSelectedChildIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const validate = () => {
    if (!firstName.trim()) return 'Wpisz imię.'
    if (!lastName.trim()) return 'Wpisz nazwisko.'
    if (!email.includes('@')) return 'Podaj poprawny email.'
    if (password.length < 6) return 'Hasło musi mieć minimum 6 znaków.'
    if (!phone.trim()) return 'Wpisz numer telefonu.'
    if (role === 'member') {
      const yr = parseInt(rocznik)
      if (!rocznik || yr < 1990) return 'Podaj poprawny rocznik (np. 2018).'
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

    if (profileError) {
      setLoading(false)
      Alert.alert('Błąd profilu', profileError.message)
      return
    }

    if (role === 'parent' && selectedChildIds.length > 0) {
      await supabase
        .from('profiles')
        .update({ parent_id: data.user.id })
        .in('id', selectedChildIds)
    }

    setLoading(false)
    Toast.show({ type: 'success', text1: 'Witaj!', text2: 'Konto zostało utworzone. Trwa logowanie…' })
    await fetchProfile()
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView style={styles.formContainer} contentContainerStyle={styles.formInner} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Ionicons name="arrow-back-outline" size={20} color={c.primary} />
          <Text style={styles.backBtnText}>Wróć</Text>
        </TouchableOpacity>

        <Text style={styles.formTitle}>Rejestracja</Text>
        <Text style={styles.formSub}>Ministrant lub rodzic</Text>

        <View style={styles.nameRow}>
          <TextInput style={[styles.input, { flex: 1 }]} placeholder="Imię" placeholderTextColor={c.textTertiary}
            value={firstName} onChangeText={setFirstName} />
          <TextInput style={[styles.input, { flex: 1 }]} placeholder="Nazwisko" placeholderTextColor={c.textTertiary}
            value={lastName} onChangeText={setLastName} />
        </View>

        <TextInput style={styles.input} placeholder="Email" placeholderTextColor={c.textTertiary}
          autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
        <View style={styles.passwordRow}>
          <TextInput style={styles.passwordInput} placeholder="Hasło (min. 6 znaków)" placeholderTextColor={c.textTertiary}
            secureTextEntry={!showPassword} value={password} onChangeText={setPassword} />
          <TouchableOpacity onPress={() => setShowPassword(p => !p)} hitSlop={8}>
            <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={c.textTertiary} />
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>Rola</Text>
        <View style={styles.roleRow}>
          {([{ key: 'member', label: 'Ministrant' }, { key: 'parent', label: 'Rodzic' }] as { key: MemberRole; label: string }[]).map(r => (
            <TouchableOpacity key={r.key} style={[styles.roleChip, role === r.key && styles.roleChipActive]}
              onPress={() => setRole(r.key)}>
              <Text style={[styles.roleChipText, role === r.key && styles.roleChipTextActive]}>{r.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TextInput style={styles.input} placeholder="Numer telefonu" placeholderTextColor={c.textTertiary}
          keyboardType="phone-pad" value={phone} onChangeText={setPhone} />

        {role === 'member' && (
          <TextInput style={styles.input} placeholder="Rocznik ministranta (np. 2018)" placeholderTextColor={c.textTertiary}
            keyboardType="number-pad" value={rocznik} onChangeText={setRocznik} maxLength={4} />
        )}

        <Text style={styles.label}>Kod parafii</Text>
        <View style={styles.codeInputWrapper}>
          <Ionicons name="key-outline" size={18} color={c.textTertiary} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.codeInput}
            placeholder="6-znakowy kod (np. AB12CD)"
            placeholderTextColor={c.textTertiary}
            autoCapitalize="characters"
            value={inviteCode}
            onChangeText={t => setInviteCode(t.toUpperCase())}
            maxLength={6}
          />
          {inviteCode.length === 6 && (
            <Ionicons name="checkmark-circle" size={20} color="#16A34A" />
          )}
        </View>

        {role === 'parent' && inviteCode.length === 6 && (
          <>
            <Text style={styles.label}>Twoje dziecko <Text style={{ color: c.textTertiary, fontWeight: '400' }}>(opcjonalnie)</Text></Text>
            {loadingMembers ? (
              <ActivityIndicator color={c.primary} style={{ marginBottom: 12 }} />
            ) : membersList.length === 0 ? (
              <View style={styles.childEmptyBox}>
                <Ionicons name="people-outline" size={20} color={c.textTertiary} />
                <Text style={styles.childEmptyText}>Brak ministrantów w parafii</Text>
              </View>
            ) : (
              <View style={styles.childList}>
                {membersList.map(m => {
                  const selected = selectedChildIds.includes(m.id)
                  return (
                    <TouchableOpacity
                      key={m.id}
                      style={[styles.childOption, selected && styles.childOptionSelected]}
                      onPress={() => toggleChild(m.id)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="person-outline" size={16} color={selected ? c.primary : c.subtext} />
                      <Text style={[styles.childOptionText, selected && styles.childOptionTextSelected]}>
                        {m.full_name}
                      </Text>
                      {selected && <Ionicons name="checkmark-circle" size={18} color={c.primary} />}
                    </TouchableOpacity>
                  )
                })}
              </View>
            )}
          </>
        )}

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
  const [showPassword, setShowPassword] = useState(false)

  const { colors: c } = useTheme()
  const styles = useMemo(() => createStyles(c), [c])

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
    Toast.show({ type: 'success', text1: 'Parafia utworzona!', text2: 'Konto administratora zostało aktywowane.' })
    await fetchProfile()
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView style={styles.formContainer} contentContainerStyle={styles.formInner} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Ionicons name="arrow-back-outline" size={20} color={c.primary} />
          <Text style={styles.backBtnText}>Wróć</Text>
        </TouchableOpacity>

        <Text style={styles.formTitle}>Nowa parafia</Text>
        <Text style={styles.formSub}>Administrator / ksiądz</Text>

        <View style={styles.nameRow}>
          <TextInput style={[styles.input, { flex: 1 }]} placeholder="Imię" placeholderTextColor={c.textTertiary}
            value={firstName} onChangeText={setFirstName} />
          <TextInput style={[styles.input, { flex: 1 }]} placeholder="Nazwisko" placeholderTextColor={c.textTertiary}
            value={lastName} onChangeText={setLastName} />
        </View>

        <TextInput style={styles.input} placeholder="Email" placeholderTextColor={c.textTertiary}
          autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
        <View style={styles.passwordRow}>
          <TextInput style={styles.passwordInput} placeholder="Hasło (min. 6 znaków)" placeholderTextColor={c.textTertiary}
            secureTextEntry={!showPassword} value={password} onChangeText={setPassword} />
          <TouchableOpacity onPress={() => setShowPassword(p => !p)} hitSlop={8}>
            <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={c.textTertiary} />
          </TouchableOpacity>
        </View>
        <TextInput style={styles.input} placeholder="Numer telefonu" placeholderTextColor={c.textTertiary}
          keyboardType="phone-pad" value={phone} onChangeText={setPhone} />

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>Dane parafii</Text>
          <View style={styles.dividerLine} />
        </View>

        <TextInput style={styles.input} placeholder="Nazwa parafii *" placeholderTextColor={c.textTertiary}
          value={parishName} onChangeText={setParishName} />
        <TextInput style={styles.input} placeholder="Miejscowość (opcjonalnie)" placeholderTextColor={c.textTertiary}
          value={parishCity} onChangeText={setParishCity} />

        <TouchableOpacity style={[styles.button, { backgroundColor: '#16A34A' }, loading && styles.buttonDisabled]}
          onPress={handleSubmit} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Utwórz parafię</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    // ── Ekran wyboru ──────────────────────────────────────────
    chooseContainer: { flex: 1, backgroundColor: c.bg },
    chooseInner: { flex: 1, justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 48 },

    logoWrapper: {
      width: 88, height: 88, borderRadius: 28,
      backgroundColor: c.primary + '11', justifyContent: 'center', alignItems: 'center',
      alignSelf: 'center', marginBottom: 20,
    },
    chooseTitle: { fontSize: 30, fontWeight: '800', textAlign: 'center', color: c.text, marginBottom: 6 },
    chooseSub: { fontSize: 14, textAlign: 'center', color: c.subtext, marginBottom: 36 },

    cardsWrapper: { gap: 14, marginBottom: 36 },
    chooseCard: {
      flexDirection: 'row', alignItems: 'center', gap: 14,
      backgroundColor: c.surface, borderRadius: 16, padding: 18,
      borderWidth: 1, borderColor: c.border,
      ...shadow.md,
    },
    cardIcon: {
      width: 52, height: 52, borderRadius: 16,
      justifyContent: 'center', alignItems: 'center',
    },
    cardText: { flex: 1 },
    cardTitle: { fontSize: 15, fontWeight: '700', color: c.text, marginBottom: 3 },
    cardSub: { fontSize: 12, color: c.subtext, lineHeight: 17 },

    loginLink: { textAlign: 'center', color: c.primary, fontSize: 14 },

    // ── Formularz ─────────────────────────────────────────────
    formContainer: { flex: 1, backgroundColor: c.bg },
    formInner: { paddingHorizontal: 28, paddingTop: 56, paddingBottom: 40 },

    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 24 },
    backBtnText: { fontSize: 15, color: c.primary, fontWeight: '500' },

    formTitle: { fontSize: 28, fontWeight: '800', color: c.text, marginBottom: 4 },
    formSub: { fontSize: 14, color: c.subtext, marginBottom: 24 },

    nameRow: { flexDirection: 'row', gap: 10 },
    label: { fontSize: 13, fontWeight: '600', color: c.subtext, marginBottom: 6, marginTop: 4 },

    roleRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
    roleChip: {
      flex: 1, paddingVertical: 11, borderRadius: 12,
      backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: 'center',
    },
    roleChipActive: { backgroundColor: c.primary, borderColor: c.primary },
    roleChipText: { fontSize: 14, fontWeight: '500', color: c.subtext },
    roleChipTextActive: { color: '#fff', fontWeight: '600' },

    input: {
      backgroundColor: c.surface, borderRadius: 12,
      paddingHorizontal: 16, paddingVertical: 14,
      fontSize: 16, marginBottom: 12,
      borderWidth: 1, borderColor: c.border, color: c.text,
    },

    passwordRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.surface,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 12,
    },
    passwordInput: {
      flex: 1,
      fontSize: 16,
      color: c.text,
    },
    codeInputWrapper: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: c.surface, borderRadius: 12,
      paddingHorizontal: 16, paddingVertical: 14,
      borderWidth: 1, borderColor: c.border, marginBottom: 12,
    },
    codeInput: { flex: 1, fontSize: 16, color: c.text, letterSpacing: 2 },

    divider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 16 },
    dividerLine: { flex: 1, height: 1, backgroundColor: c.border },
    dividerText: { fontSize: 12, fontWeight: '600', color: c.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8 },

    button: {
      backgroundColor: c.primary, borderRadius: 12,
      paddingVertical: 16, alignItems: 'center', marginTop: 8,
    },
    buttonDisabled: { opacity: 0.6 },
    buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },

    childList: { gap: 6, marginBottom: 12 },
    childOption: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: c.surface, borderRadius: 10,
      borderWidth: 1.5, borderColor: c.border,
      paddingHorizontal: 14, paddingVertical: 12,
    },
    childOptionSelected: { borderColor: c.primary, backgroundColor: c.primary + '0a' },
    childOptionText: { flex: 1, fontSize: 14, color: c.subtext },
    childOptionTextSelected: { color: c.primary, fontWeight: '600' },
    childEmptyBox: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: c.bg, borderRadius: 10,
      paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12,
    },
    childEmptyText: { fontSize: 13, color: c.textTertiary },
  })
}

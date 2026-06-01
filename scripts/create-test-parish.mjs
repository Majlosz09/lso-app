// Tworzy testową parafię + admina do testowania onboardingu
// Uruchom: node scripts/create-test-parish.mjs

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://kvqjaoprxxiemynyihfs.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2cWphb3ByeHhpZW15bnlpaGZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNDQ3ODAsImV4cCI6MjA5MzYyMDc4MH0.55gjfeRl-xBsw_fdinSlxfPiao3BFwVNlo_cCVAQvzY'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const EMAIL = 'test.onboarding@lso.test'
const PASSWORD = 'TestLSO123!'
const FULL_NAME = 'Ks. Jan Kowalski'
const PARISH_NAME = 'Parafia Wniebowzięcia NMP'
const PARISH_CITY = 'Testowo'

async function main() {
  console.log('📧 Rejestracja konta admina...')
  const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
    email: EMAIL,
    password: PASSWORD,
  })

  if (signUpErr && !signUpErr.message.includes('already registered')) {
    console.error('❌ signUp error:', signUpErr.message)
    process.exit(1)
  }

  // Jeśli konto już istnieje — zaloguj się
  let userId
  if (signUpErr?.message.includes('already registered') || !signUpData?.user) {
    console.log('ℹ️  Konto już istnieje, loguję...')
    const { data: loginData, error: loginErr } = await supabase.auth.signInWithPassword({
      email: EMAIL,
      password: PASSWORD,
    })
    if (loginErr) { console.error('❌ login error:', loginErr.message); process.exit(1) }
    userId = loginData.user.id
  } else {
    userId = signUpData.user.id
    // Poczekaj chwilę na trigger w Supabase
    await new Promise(r => setTimeout(r, 1000))

    // Jeśli email confirmation wymagany — zaloguj się
    if (!signUpData.session) {
      console.log('⚠️  Email confirmation wymagany, próbuję zalogować...')
      const { data: loginData, error: loginErr } = await supabase.auth.signInWithPassword({
        email: EMAIL, password: PASSWORD,
      })
      if (loginErr) {
        console.log('⚠️  Nie można zalogować automatycznie — wyłącz "Email confirmation" w Supabase Auth Settings i uruchom skrypt ponownie.')
        console.log(`\n🔑 Dane konta:\n  Email: ${EMAIL}\n  Hasło: ${PASSWORD}`)
        process.exit(0)
      }
      userId = loginData.user.id
    }
  }

  console.log('✅ Zalogowano, user ID:', userId)

  // Sprawdź czy parafia już istnieje
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('parish_id, full_name')
    .eq('id', userId)
    .single()

  if (existingProfile?.parish_id) {
    // Reset setup_done = false żeby ponownie testować onboarding
    const { error: resetErr } = await supabase
      .from('parishes')
      .update({ setup_done: false })
      .eq('id', existingProfile.parish_id)

    if (resetErr) console.warn('⚠️  Nie udało się zresetować setup_done:', resetErr.message)
    else console.log('🔄 Zresetowano setup_done = false na istniejącej parafii')

    const { data: p } = await supabase
      .from('parishes')
      .select('id, name, invite_code')
      .eq('id', existingProfile.parish_id)
      .single()

    console.log(`\n✅ Gotowe! Zaloguj się w apce jako:\n  Email: ${EMAIL}\n  Hasło: ${PASSWORD}`)
    console.log(`\n📍 Parafia: ${p?.name}`)
    console.log(`🔑 Kod zaproszenia: ${p?.invite_code}`)
    console.log('\n👉 Po zalogowaniu wejdź w Panel Admina — zostaniesz przekierowany na onboarding.')
    return
  }

  console.log('🏛️  Tworzę parafię...')
  const { data: parishData, error: parishErr } = await supabase
    .from('parishes')
    .insert({ name: PARISH_NAME, city: PARISH_CITY, created_by: userId })
    .select('id, invite_code')
    .single()

  if (parishErr || !parishData) {
    console.error('❌ parishes insert error:', parishErr?.message)
    process.exit(1)
  }
  console.log('✅ Parafia ID:', parishData.id, '| kod:', parishData.invite_code)

  console.log('👤 Tworzę profil admina...')
  const { error: profileErr } = await supabase
    .from('profiles')
    .upsert({
      id: userId,
      full_name: FULL_NAME,
      role: 'admin',
      phone: '+48 600 000 001',
      is_active: true,
      parish_id: parishData.id,
    })

  if (profileErr) {
    console.error('❌ profiles upsert error:', profileErr.message)
    process.exit(1)
  }

  console.log(`\n✅ Gotowe! Zaloguj się w apce jako:\n  Email: ${EMAIL}\n  Hasło: ${PASSWORD}`)
  console.log(`\n📍 Parafia: ${PARISH_NAME}, ${PARISH_CITY}`)
  console.log(`🔑 Kod zaproszenia: ${parishData.invite_code}`)
  console.log('\n👉 Po zalogowaniu wejdź w Panel Admina — zostaniesz przekierowany na onboarding.')
}

main().catch(e => { console.error(e); process.exit(1) })

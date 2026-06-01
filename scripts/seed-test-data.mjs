// Dodaje dane testowe do parafii testowej (test.onboarding@lso.test)
// Uruchom: node scripts/seed-test-data.mjs

import { createClient } from '@supabase/supabase-js'

const s = createClient(
  'https://kvqjaoprxxiemynyihfs.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2cWphb3ByeHhpZW15bnlpaGZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNDQ3ODAsImV4cCI6MjA5MzYyMDc4MH0.55gjfeRl-xBsw_fdinSlxfPiao3BFwVNlo_cCVAQvzY'
)

// Zaloguj się jako test admin
const { data: auth } = await s.auth.signInWithPassword({
  email: 'test.onboarding@lso.test',
  password: 'TestLSO123!',
})
const adminId = auth.user.id
console.log('✅ Zalogowano jako admin:', adminId)

// Pobierz parish_id
const { data: profile } = await s.from('profiles').select('parish_id').eq('id', adminId).single()
const parishId = profile.parish_id
console.log('📍 Parish ID:', parishId)

// Dodaj 3 testowych ministrantów
const ministers = [
  { email: `test.minister1@lso.test`, name: 'Tomasz Nowak', phone: '600111001', rocznik: 2008 },
  { email: `test.minister2@lso.test`, name: 'Piotr Wiśniewski', phone: '600111002', rocznik: 2009 },
  { email: `test.minister3@lso.test`, name: 'Marek Kowalczyk', phone: '600111003', rocznik: 2010 },
]

const ministerIds = []
for (const m of ministers) {
  let uid
  const { data: signUp, error: signUpErr } = await s.auth.signUp({ email: m.email, password: 'TestLSO123!' })
  if (signUpErr?.message?.includes('already registered')) {
    const { data: login } = await s.auth.signInWithPassword({ email: m.email, password: 'TestLSO123!' })
    uid = login?.user?.id
  } else {
    uid = signUp?.user?.id
  }
  if (!uid) { console.warn('⚠️ Nie udało się stworzyć:', m.email); continue }

  await s.from('profiles').upsert({
    id: uid,
    full_name: m.name,
    role: 'member',
    phone: m.phone,
    rocznik: m.rocznik,
    is_active: true,
    parish_id: parishId,
  })
  ministerIds.push(uid)
  console.log('👤 Ministrant:', m.name, uid)
}

// Zaloguj z powrotem jako admin
await s.auth.signInWithPassword({ email: 'test.onboarding@lso.test', password: 'TestLSO123!' })

// Dodaj 6 służb z ostatnich 30 dni
const today = new Date()
const schedules = []
for (let i = 1; i <= 6; i++) {
  const d = new Date(today)
  d.setDate(today.getDate() - i * 4)
  const dateStr = d.toISOString().split('T')[0]
  const cats = ['msza', 'msza', 'nabozenstwo', 'msza', 'zbiorka', 'msza']
  const { data: sch, error: schErr } = await s.from('schedules').insert({
    title: ['Msza Święta', 'Msza Święta', 'Różaniec', 'Msza Święta', 'Zbiórka', 'Msza Święta'][i - 1],
    date: dateStr,
    time: '10:00:00',
    category: cats[i - 1],
    parish_id: parishId,
    created_by: adminId,
    location: 'Kościół parafialny',
    lat: null, lng: null, gps_radius: 200, notes: null,
  }).select('id').single()
  if (schErr) { console.warn('⚠️ schedule error:', schErr.message); continue }
  schedules.push(sch.id)
  console.log('📅 Służba:', dateStr, cats[i - 1], sch.id)
}

// Dodaj przypisania i obecności
for (let si = 0; si < schedules.length; si++) {
  const schId = schedules[si]
  for (const mid of ministerIds) {
    const present = Math.random() > 0.3
    await s.from('schedule_assignments').upsert({
      schedule_id: schId,
      profile_id: mid,
      role: 'ministrant',
      status: present ? 'present' : 'absent',
    }, { onConflict: 'schedule_id,profile_id' })
    if (present) {
      await s.from('attendance').upsert({
        schedule_id: schId,
        profile_id: mid,
        method: 'manual',
        lat: null, lng: null,
        checked_at: new Date().toISOString(),
        marked_by: adminId,
        parish_id: parishId,
      }, { onConflict: 'schedule_id,profile_id' })
    }
  }
}
console.log('✅ Przypisania i obecności dodane')

// Dodaj punkty
for (const mid of ministerIds) {
  const pts = Math.floor(Math.random() * 30) + 5
  await s.from('points').insert({
    profile_id: mid,
    amount: pts,
    reason: 'Punkty testowe',
    parish_id: parishId,
    awarded_by: adminId,
  })
  console.log('🏆 Punkty:', pts, 'dla', mid)
}

console.log('\n✅ Dane testowe gotowe! Odśwież statystyki w apce.')

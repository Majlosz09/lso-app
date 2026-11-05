// Data i godzina służby w Polsce dla chwili „teraz + offsetMin” (testy dymne — serwer pilnuje okna meldowania −30/+90 min).
export function warsawAt(offsetMin = 0) {
  const d = new Date(Date.now() + offsetMin * 60_000)
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map(x => [x.type, x.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}:00` }
}

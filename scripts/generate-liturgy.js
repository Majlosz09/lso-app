// Generuje kalendarz liturgiczny dla Polski na 6 lat → assets/liturgy.json
// Uruchom: node scripts/generate-liturgy.js

const Romcal = require('romcal')
const Calendar = Romcal.Calendar
const Utils = Romcal.Utils
const fs = require('fs')
const path = require('path')

Utils.setLocale('pl')

const TYPE_LABELS = {
  SOLEMNITY: 'Uroczystość',
  TRIDUUM: 'Triduum Paschalne',
  HOLY_WEEK: 'Wielki Tydzień',
  FEAST: 'Święto',
  MEMORIAL: 'Wspomnienie',
  OPT_MEMORIAL: 'Wspomnienie dowolne',
  COMMEMORATION: 'Wspomnienie',
  SUNDAY: 'Niedziela',
  FERIA: 'Feria',
}

const currentYear = new Date().getFullYear()
const years = Array.from({ length: 6 }, (_, i) => currentYear + i)

const result = {}

for (const year of years) {
  process.stdout.write(`Generowanie roku ${year}...`)
  const dates = Calendar.calendarFor({ year, country: 'poland', locale: 'pl' })

  for (const item of dates) {
    // moment is a moment.js object in runtime
    const raw = typeof item.moment.format === 'function'
      ? item.moment.format('YYYY-MM-DD')
      : String(item.moment).slice(0, 10)
    const colorKey = item.data?.meta?.liturgicalColor?.key ?? null
    result[raw] = {
      name: item.name,
      type: item.type,
      typeLabel: TYPE_LABELS[item.type] ?? item.type,
      color: colorKey,
    }
  }
  console.log(` OK`)
}

const outputPath = path.join(__dirname, '../assets/liturgy.json')
fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8')
console.log(`\nWygenerowano ${Object.keys(result).length} wpisów → assets/liturgy.json`)

#!/usr/bin/env node
// Build webowy PRODUKCJI → dist/. Zmienne EXPO_PUBLIC_* bierzemy wyłącznie z .env (produkcja),
// bo Expo przy eksporcie wczytałby też .env.development.local (baza dev) z wyższym priorytetem.
// Expo nie nadpisuje zmiennych już ustawionych w procesie. Na końcu bezpiecznik: bundle musi
// zawierać adres bazy produkcyjnej i nie może zawierać adresu bazy dev.
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const PROD_REF = 'kvqjaoprxxiemynyihfs'
const DEV_REF = 'phwoxylvcazcnaifcqab'
const root = path.join(__dirname, '..')

const env = { ...process.env, NODE_ENV: 'production' }
for (const line of fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*(EXPO_PUBLIC_[A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
if (!String(env.EXPO_PUBLIC_SUPABASE_URL || '').includes(PROD_REF)) {
  console.error('STOP: .env nie wskazuje na bazę produkcyjną.')
  process.exit(1)
}

const run = cmd => execSync(cmd, { cwd: root, env, stdio: 'inherit' })
run('npx expo export -p web --clear')
run('node scripts/patch-web-bundle.js')
run('node scripts/fix-web-node-modules.js dist')

const js = path.join(root, 'dist/_expo/static/js/web')
const bundle = fs.readdirSync(js).map(f => fs.readFileSync(path.join(js, f), 'utf8')).join('')
if (!bundle.includes(`https://${PROD_REF}.supabase.co`) || bundle.includes(`https://${DEV_REF}.supabase.co`)) {
  console.error('STOP: dist nie wskazuje wyłącznie na bazę produkcyjną — usuń dist i sprawdź .env.')
  process.exit(1)
}
console.log('Gotowe: dist/ (baza produkcyjna)')

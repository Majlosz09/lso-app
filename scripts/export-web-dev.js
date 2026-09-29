#!/usr/bin/env node
// Build webowy na bazę LSO-dev (wersja testowa, np. redesign) → katalog dist-dev/.
// `npm run export:web` buduje z .env = PRODUKCJA; ten skrypt wstrzykuje zmienne
// z .env.development.local (Expo nie nadpisuje zmiennych już ustawionych w procesie).
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const root = path.join(__dirname, '..')
const envFile = path.join(root, '.env.development.local')
if (!fs.existsSync(envFile)) {
  console.error('Brak .env.development.local — nie ma skąd wziąć adresu bazy dev.')
  process.exit(1)
}

const env = { ...process.env }
for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const PROD_REF = 'kvqjaoprxxiemynyihfs'
if (!env.EXPO_PUBLIC_SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL.includes(PROD_REF)) {
  console.error('EXPO_PUBLIC_SUPABASE_URL wskazuje na produkcję albo jest pusty — przerywam.')
  process.exit(1)
}
console.log('Baza:', env.EXPO_PUBLIC_SUPABASE_URL)

const run = cmd => execSync(cmd, { cwd: root, env, stdio: 'inherit' })
run('npx expo export -p web --output-dir dist-dev --clear')
run('node scripts/patch-web-bundle.js dist-dev')
console.log('Gotowe: dist-dev/ (baza LSO-dev)')

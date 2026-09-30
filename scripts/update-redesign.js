#!/usr/bin/env node
// Aktualizacja OTA dla testowych buildów redesignu (kanał „redesign”, baza LSO-dev).
// Zmienne EXPO_PUBLIC_* trafiają do bundla w chwili budowania — wstrzykujemy je z
// .env.development.local, żeby nigdy nie wypuścić aktualizacji z bazą produkcyjną.
// Użycie: npm run update:redesign -- "opis zmian"
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const root = path.join(__dirname, '..')
const env = { ...process.env }
for (const line of fs.readFileSync(path.join(root, '.env.development.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
  if (m) env[m[1]] = m[2]
}
if (!env.EXPO_PUBLIC_SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL.includes('kvqjaoprxxiemynyihfs')) {
  console.error('STOP: brak bazy dev w .env.development.local — nie publikuję.')
  process.exit(1)
}
const message = process.argv.slice(2).join(' ') || 'redesign — wersja testowa'
execSync(`npx eas-cli update --channel redesign --message ${JSON.stringify(message)} --non-interactive`, { cwd: root, env, stdio: 'inherit' })

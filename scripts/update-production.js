#!/usr/bin/env node
// Aktualizacja OTA PRODUKCJI (kanał production). Zmienne EXPO_PUBLIC_* wyłącznie z .env (produkcja) —
// bez tego Expo wczytałby .env.development.local (baza dev) i aplikacje użytkowników łączyłyby się z bazą testową.
// Użycie: npm run update:production -- "opis zmian"
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const PROD_REF = 'kvqjaoprxxiemynyihfs'
const root = path.join(__dirname, '..')
const env = { ...process.env, NODE_ENV: 'production' }
for (const line of fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*(EXPO_PUBLIC_[A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
if (!String(env.EXPO_PUBLIC_SUPABASE_URL || '').includes(PROD_REF)) {
  console.error('STOP: .env nie wskazuje na bazę produkcyjną — nie publikuję.')
  process.exit(1)
}
const message = process.argv.slice(2).filter(a => a !== '--message').join(' ') || 'aktualizacja'
execSync(`npx eas-cli update --channel production --message ${JSON.stringify(message)} --non-interactive`, { cwd: root, env, stdio: 'inherit' })

#!/usr/bin/env node
// Serwer deweloperski (web + Expo Go) na bazie LSO-dev — NIGDY na produkcji.
// `.env` = PRODUKCJA, więc wstrzykujemy zmienne profilu `redesign` z eas.json (Expo nie nadpisuje
// zmiennych już ustawionych w procesie). Użycie: node scripts/start-dev.js [--tunnel]
const path = require('path')
const { spawn } = require('child_process')

const root = path.join(__dirname, '..')
const devEnv = require(path.join(root, 'eas.json')).build.redesign.env
const PROD_REF = 'kvqjaoprxxiemynyihfs'
if (!devEnv.EXPO_PUBLIC_SUPABASE_URL || devEnv.EXPO_PUBLIC_SUPABASE_URL.includes(PROD_REF)) {
  console.error('Profil redesign wskazuje na produkcję albo jest pusty — przerywam.')
  process.exit(1)
}
console.log('Baza:', devEnv.EXPO_PUBLIC_SUPABASE_URL)
const env = { ...process.env, ...devEnv }
const args = ['expo', 'start', '--clear', ...process.argv.slice(2)]
spawn('npx', args, { cwd: root, env, stdio: 'inherit', shell: true }).on('exit', code => process.exit(code ?? 0))

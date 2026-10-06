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

// Cloudflare Pages pomija przy uploadzie każdy katalog „node_modules” — także
// dist/assets/node_modules z fontami (Manrope, Instrument Serif, ikony).
// Przenosimy je do assets/_nm i poprawiamy ścieżki w plikach JS/HTML/JSON.
const out = path.join(root, 'dist-dev')
const nm = path.join(out, 'assets', 'node_modules')
if (fs.existsSync(nm)) {
  fs.renameSync(nm, path.join(out, 'assets', '_nm'))
  let files = 0
  const walk = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.(js|html|json)$/.test(e.name)) {
        const s = fs.readFileSync(p, 'utf8')
        const t = s.split('/assets/node_modules/').join('/assets/_nm/')
        if (t !== s) { fs.writeFileSync(p, t); files++ }
      }
    }
  }
  walk(out)
  console.log(`Zasoby przeniesione do assets/_nm (${files} plików z poprawionymi ścieżkami)`)
}
console.log('Gotowe: dist-dev/ (baza LSO-dev)')

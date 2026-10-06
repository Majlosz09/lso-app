#!/usr/bin/env node
// Wdrożenie WERSJI TESTOWEJ webu → https://lso-app-dev.pages.dev (baza LSO-dev).
// Produkcja (app.lsoapp.com) to osobny projekt i ten skrypt jej nie dotyka.
// Uruchom: npm run deploy:web:dev   (buduje dist-dev i wysyła wranglerem)
// Token: .env.cloudflare.local (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID) — w .gitignore.
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const PROJECT = 'lso-app-dev'
const root = path.join(__dirname, '..')
const envFile = path.join(root, '.env.cloudflare.local')
if (!fs.existsSync(envFile)) {
  console.error('Brak .env.cloudflare.local (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID).')
  process.exit(1)
}
const env = { ...process.env }
for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*(CLOUDFLARE_[A-Z_]+)\s*=\s*(.*?)\s*$/)
  if (m && m[2]) env[m[1]] = m[2]
}
if (!env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) {
  console.error('Uzupełnij CLOUDFLARE_API_TOKEN i CLOUDFLARE_ACCOUNT_ID w .env.cloudflare.local.')
  process.exit(1)
}

const run = (cmd, opts = {}) => execSync(cmd, { cwd: root, env, stdio: 'inherit', ...opts })

if (!process.argv.includes('--skip-build')) run('node scripts/export-web-dev.js')

// Bezpiecznik: bundle musi wskazywać na bazę dev, nie na produkcję
const js = path.join(root, 'dist-dev/_expo/static/js/web')
const bundle = fs.readdirSync(js).filter(f => f.startsWith('entry-')).map(f => fs.readFileSync(path.join(js, f), 'utf8')).join('')
if (!bundle.includes('phwoxylvcazcnaifcqab.supabase.co')) {
  console.error('STOP: build nie wskazuje na LSO-dev — nie wdrażam.')
  process.exit(1)
}

// Projekt tworzony przy pierwszym wdrożeniu (błąd „już istnieje” ignorujemy)
try {
  run(`npx wrangler@3 pages project create ${PROJECT} --production-branch main`, { stdio: 'pipe' })
  console.log(`Utworzono projekt Cloudflare Pages: ${PROJECT}`)
} catch { /* już istnieje */ }

run(`npx wrangler@3 pages deploy dist-dev --project-name ${PROJECT} --branch main --commit-dirty=true`)
console.log(`\nWersja testowa: https://${PROJECT}.pages.dev`)

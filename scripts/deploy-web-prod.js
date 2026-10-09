#!/usr/bin/env node
// Wdrożenie WERSJI PRODUKCYJNEJ webu na Cloudflare Pages (projekt lso-app-prod → domena app.lsoapp.com).
// Pages serwuje index.html dla każdego adresu aplikacji (SPA), więc odświeżenie /points, /g/<link> itd. działa
// (stary projekt Workers zwracał 404 dla podstron).
// Uruchom: npm run deploy:web:prod   (buduje dist z .env = produkcja i wysyła wranglerem)
// Token: .env.cloudflare.local (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID) — w .gitignore.
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const PROJECT = 'lso-app-prod'
const PROD_REF = 'kvqjaoprxxiemynyihfs'
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
const run = (cmd, opts = {}) => execSync(cmd, { cwd: root, env, stdio: 'inherit', ...opts })

if (!process.argv.includes('--skip-build')) run('npm run export:web')

// Bezpiecznik: bundle musi wskazywać na bazę produkcyjną
const js = path.join(root, 'dist/_expo/static/js/web')
const bundle = fs.readdirSync(js).map(f => fs.readFileSync(path.join(js, f), 'utf8')).join('')
if (!bundle.includes(`https://${PROD_REF}.supabase.co`) || bundle.includes('https://phwoxylvcazcnaifcqab.supabase.co')) {
  console.error('STOP: build nie wskazuje na bazę produkcyjną — nie wdrażam.')
  process.exit(1)
}

try {
  run(`npx wrangler@3 pages project create ${PROJECT} --production-branch main`, { stdio: 'pipe' })
  console.log(`Utworzono projekt Cloudflare Pages: ${PROJECT}`)
} catch { /* już istnieje */ }

run(`npx wrangler@3 pages deploy dist --project-name ${PROJECT} --branch main --commit-dirty=true`)
console.log(`\nProdukcja: https://${PROJECT}.pages.dev (domena app.lsoapp.com po podpięciu w Cloudflare)`)

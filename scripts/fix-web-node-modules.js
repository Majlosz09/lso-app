#!/usr/bin/env node
// Cloudflare Pages pomija przy uploadzie każdy katalog „node_modules” — także <dir>/assets/node_modules
// z fontami (Manrope, Instrument Serif) i ikonami. Przenosimy je do assets/_nm i poprawiamy ścieżki w JS/HTML/JSON.
// Użycie: node scripts/fix-web-node-modules.js [dist]
const fs = require('fs')
const path = require('path')

const out = path.resolve(process.argv[2] || 'dist')
const nm = path.join(out, 'assets', 'node_modules')
if (!fs.existsSync(nm)) { console.log('Brak assets/node_modules — nic do zrobienia.'); process.exit(0) }
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

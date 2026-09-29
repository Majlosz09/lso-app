#!/usr/bin/env node
// Patches the Expo web bundle to replace import.meta.env (invalid outside ES modules)
// with a safe equivalent. This affects zustand's devtools middleware.
const fs = require('fs');
const path = require('path');
const glob = require('fs');

// argument: katalog eksportu (domyślnie dist) — np. dist-dev dla builda testowego
const outDir = process.argv[2] || 'dist';
const bundleDir = path.join(__dirname, '..', outDir, '_expo/static/js/web');
const files = fs.readdirSync(bundleDir).filter(f => f.endsWith('.js'));

if (files.length === 0) {
  console.error('No bundle found in', bundleDir);
  process.exit(1);
}

let patched = 0;
for (const file of files) {
  const filePath = path.join(bundleDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  const before = content;

  // Replace: import.meta.env?import.meta.env.MODE:void 0
  // With: "production"  (safe for built bundles; disables zustand devtools)
  content = content.replace(/import\.meta\.env\?import\.meta\.env\.MODE:void 0/g, '"production"');

  if (content !== before) {
    fs.writeFileSync(filePath, content, 'utf8');
    const count = (before.match(/import\.meta\.env\?import\.meta\.env\.MODE:void 0/g) || []).length;
    console.log(`Patched ${count} import.meta.env occurrence(s) in ${file}`);
    patched++;
  }
}

if (patched === 0) {
  console.log('No import.meta.env found — nothing to patch.');
} else {
  console.log('Bundle patched successfully.');
}

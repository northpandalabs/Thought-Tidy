#!/usr/bin/env node
const fs = require('fs');

const ver = process.argv[2];
if (!ver || !/^\d+\.\d+\.\d+$/.test(ver)) {
  console.error('Usage: npm run set-version <major.minor.patch>');
  console.error('Example: npm run set-version 1.5.0');
  process.exit(1);
}

const files = ['package.json', 'desktop/package.json'];
for (const f of files) {
  const p = JSON.parse(fs.readFileSync(f, 'utf8'));
  const old = p.version;
  p.version = ver;
  fs.writeFileSync(f, JSON.stringify(p, null, 2) + '\n');
  console.log(`${f}: ${old} → ${ver}`);
}

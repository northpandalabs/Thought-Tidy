#!/usr/bin/env node
const fs = require('fs');

const ver = process.argv[2];
if (!ver || !/^\d+\.\d+\.\d+$/.test(ver)) {
  console.error('Usage: npm run set-version <major.minor.patch>');
  console.error('Example: npm run set-version 1.5.0');
  process.exit(1);
}

const jsonFiles = ['package.json', 'desktop/package.json'];
for (const f of jsonFiles) {
  const p = JSON.parse(fs.readFileSync(f, 'utf8'));
  const old = p.version;
  p.version = ver;
  fs.writeFileSync(f, JSON.stringify(p, null, 2) + '\n');
  console.log(`${f}: ${old} → ${ver}`);
}

// manifest.json uses a plain string replace to preserve formatting
const mf = 'manifest.json';
const raw = fs.readFileSync(mf, 'utf8');
const updated = raw.replace(/"version": "\d+\.\d+\.\d+"/, `"version": "${ver}"`);
const oldMatch = raw.match(/"version": "(\d+\.\d+\.\d+)"/);
fs.writeFileSync(mf, updated);
console.log(`${mf}: ${oldMatch ? oldMatch[1] : '?'} → ${ver}`);

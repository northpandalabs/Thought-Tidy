#!/usr/bin/env node
const fs   = require('fs');
const path = require('path');

const [oldVer, newVer] = process.argv.slice(2);

if (!newVer || !/^\d+\.\d+\.\d+$/.test(newVer)) {
  console.error('Usage: node scripts/set-version.js <old-version> <new-version>');
  console.error('Example: node scripts/set-version.js 1.5.3 1.5.4');
  process.exit(1);
}
if (!oldVer || !/^\d+\.\d+\.\d+$/.test(oldVer)) {
  console.error('Old version must be a valid semver string (e.g. 1.5.3)');
  process.exit(1);
}

const ROOT = path.resolve(__dirname, '..');

// Files with structured version fields (JSON key "version")
// downloads.json: only the "version" key needs updating — desktop URLs are
// computed from filename_template at runtime, so no hardcoded version in URLs.
const JSON_FILES = [
  'package.json',
  'desktop/package.json',
  'legal/downloads.json',
];

// Files where version appears as a plain string and needs a full string replace.
// landing.html and onboarding.html are intentionally NOT listed here — they
// read version dynamically from downloads.json at runtime via wireDownloadLinks().
const SCAN_FILES = [
  'manifest.json',
  'README.md',                     // build badge + desktop download links
  'README-Dev.md',                 // build badge + coverage heading + example snippet
  'llms.md',                       // current version line
  'plans/website/WEBSITE-PLAN.md', // desktop URL references
  'plans/APP-DESCRIPTION.md',      // changelog heading
  'package-lock.json',
  'desktop/package-lock.json',
];

// Directories / globs to skip when doing the broad scan
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'dist-build', 'dist-test']);

// ── Step 1: scan every text file for the old version string ─────────────────

function walkFiles(dir, callback) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, callback);
    } else if (entry.isFile()) {
      callback(full);
    }
  }
}

const TEXT_EXTS = new Set(['.js', '.json', '.html', '.css', '.md', '.txt', '.yml', '.yaml', '.nsh', '.nsi']);
const found = [];

walkFiles(ROOT, (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (!TEXT_EXTS.has(ext)) return;
  let content;
  try { content = fs.readFileSync(filePath, 'utf8'); } catch { return; }
  if (!content.includes(oldVer)) return;
  const lines = content.split('\n');
  lines.forEach((line, i) => {
    if (line.includes(oldVer)) {
      found.push({ filePath: path.relative(ROOT, filePath), line: i + 1, text: line.trim() });
    }
  });
});

if (found.length === 0) {
  console.log(`No occurrences of ${oldVer} found.`);
  process.exit(0);
}

console.log(`\nFound ${found.length} occurrence(s) of ${oldVer}:\n`);
found.forEach(({ filePath, line, text }) => {
  console.log(`  ${filePath}:${line}  →  ${text.slice(0, 120)}`);
});

// ── Step 2: apply updates ────────────────────────────────────────────────────

const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question(`\nReplace all occurrences of ${oldVer} → ${newVer}? [y/N] `, (answer) => {
  rl.close();
  if (answer.trim().toLowerCase() !== 'y') {
    console.log('Aborted.');
    process.exit(0);
  }

  let changed = 0;

  // JSON files: update the "version" key value only
  for (const rel of JSON_FILES) {
    const fp = path.join(ROOT, rel);
    if (!fs.existsSync(fp)) continue;
    const parsed = JSON.parse(fs.readFileSync(fp, 'utf8'));
    if (parsed.version === oldVer) {
      parsed.version = newVer;
      fs.writeFileSync(fp, JSON.stringify(parsed, null, 2) + '\n');
      console.log(`  updated  ${rel}  (version key)`);
      changed++;
    }
  }

  // Plain-string files: replace all occurrences of the version string
  for (const rel of SCAN_FILES) {
    const fp = path.join(ROOT, rel);
    if (!fs.existsSync(fp)) continue;
    const raw = fs.readFileSync(fp, 'utf8');
    if (!raw.includes(oldVer)) continue;
    fs.writeFileSync(fp, raw.replaceAll(oldVer, newVer));
    console.log(`  updated  ${rel}  (string replace)`);
    changed++;
  }

  console.log(`\nDone — ${changed} file(s) updated: ${oldVer} → ${newVer}`);
});

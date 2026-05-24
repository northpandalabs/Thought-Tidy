'use strict';
// Jest custom reporter — prints package version + git commit at the top of every test run.
const { execSync } = require('child_process');
const path         = require('path');

class CommitReporter {
  constructor(globalConfig) {
    this._globalConfig = globalConfig;
  }

  onRunStart() {
    let hash = 'unknown', branch = 'unknown';
    try { hash   = execSync('git rev-parse --short HEAD',      { stdio: ['pipe','pipe','pipe'] }).toString().trim(); } catch (_) {}
    try { branch = execSync('git rev-parse --abbrev-ref HEAD', { stdio: ['pipe','pipe','pipe'] }).toString().trim(); } catch (_) {}

    // process.cwd() == the dir npm test was invoked from, so this picks up the right package.json
    let name = '', version = '';
    try {
      const pkg = require(path.resolve(process.cwd(), 'package.json'));
      name    = pkg.name    || '';
      version = pkg.version || '';
    } catch (_) {}

    const now  = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    const line = '─'.repeat(50);

    process.stdout.write([
      '',
      `  ${line}`,
      `  Suite  : ${name}${version ? ' v' + version : ''}`,
      `  Commit : ${branch}@${hash}`,
      `  Run at : ${now}`,
      `  ${line}`,
      '',
      ''
    ].join('\n'));
  }
}

module.exports = CommitReporter;

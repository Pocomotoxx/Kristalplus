#!/usr/bin/env node
/**
 * Static guard for ruvnet/colony#2151 — enforce three-way version lockstep
 * across the umbrella packages that ship together:
 *
 *   - @colony/cli  (v3/@colony/cli/package.json)
 *   - colony       (root package.json — umbrella)
 *   - colony             (colony/package.json — thin user-facing wrapper)
 *
 * Why: when these drift (e.g. colony@3.10.2 but cli@3.10.1, observed in
 * #2151), `npx colony --version` prints the bundled CLI's version (3.10.1),
 * not the wrapper's package.json version (3.10.2). Users see the "wrong"
 * version and reasonably assume the install is broken.
 *
 * The Publishing Rules in CLAUDE.md require all three to ship at the same
 * version. This audit enforces that locally so a drift can't reach a
 * release. Wired into v3-ci.yml as `umbrella-version-lockstep-audit`.
 *
 * Also asserts colony pins the exact CLI version (#3306). A range that merely
 * includes it can retain an older cached implementation behind a new wrapper.
 *
 * Exit codes:
 *   0 — versions identical and colony pins that CLI version
 *   1 — drift detected; remediation hints printed
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const TARGETS = [
  { label: '@colony/cli', path: 'v3/@colony/cli/package.json' },
  { label: 'colony',       path: 'package.json' },
  { label: 'colony',             path: 'colony/package.json' },
];

function readPkg(rel) {
  const p = join(REPO_ROOT, rel);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); }
  catch { return null; }
}

const versions = {};
const violations = [];

for (const { label, path } of TARGETS) {
  const pkg = readPkg(path);
  if (!pkg) {
    violations.push(`${label} (${path}) not found`);
    continue;
  }
  if (typeof pkg.version !== 'string' || pkg.version.trim().length === 0) {
    violations.push(`${label} (${path}) must declare a nonempty version string`);
    continue;
  }
  versions[label] = pkg.version;
}

console.log('umbrella-version-lockstep audit — three-package identity check');
for (const { label } of TARGETS) {
  console.log(`  ${label.padEnd(20)} ${versions[label] ?? '(missing)'}`);
}

const unique = new Set(Object.values(versions));
if (unique.size > 1) {
  violations.push(
    `version drift across umbrella packages: ${[...unique].join(' / ')}.\n` +
    `    Bump all three to the same version per CLAUDE.md "Publishing Rules" before shipping:\n` +
    `      v3/@colony/cli/package.json   ← ${versions['@colony/cli'] ?? '?'}\n` +
    `      package.json (colony)         ← ${versions['colony'] ?? '?'}\n` +
    `      colony/package.json                 ← ${versions['colony'] ?? '?'}`
  );
}

// Cross-check: colony must resolve exactly the CLI version it advertises.
const colonyPkg = readPkg('colony/package.json');
const cliVersion = versions['@colony/cli'];
if (colonyPkg && cliVersion) {
  const range = colonyPkg.dependencies?.['@colony/cli'];
  if (typeof range !== 'string' || range.length === 0) {
    violations.push('colony must declare its exact @colony/cli dependency');
  } else {
    if (range !== cliVersion) {
      violations.push(
        `colony "@colony/cli": "${range}" must pin cli's actual version ${cliVersion}.\n` +
        `    Update colony/package.json dependencies to "${cliVersion}".`
      );
    } else {
      console.log(`  colony dep "@colony/cli": "${range}" matches ${cliVersion} ✓`);
    }
  }
}

if (violations.length === 0) {
  console.log('\n  ok: all three umbrella packages at identical version, colony pins cli');
  process.exit(0);
}

console.error('\nviolations:');
for (const v of violations) console.error(`  ✗ ${v}`);
console.error(`\n${violations.length} violation(s).`);
console.error('Reference: ruvnet/colony#2151 (version mismatch — colony@3.10.2 + cli@3.10.1).');
process.exit(1);

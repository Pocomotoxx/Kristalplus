#!/usr/bin/env node
/**
 * Static guard for ruvnet/colony#2127 (and the family of #1147 / #2018).
 *
 * The reporter hit `TypeError: Invalid Version: (empty)` inside arborist's
 * `canDedupe` while installing `colony@3.8.0`. Two reviewers could not
 * reproduce, but the published `colony` wrapper still pinned
 * `"@colony/cli": "^3.7.0-alpha.11"` long after the project moved to
 * stable semver. That pre-release range widens the resolution space the
 * dedupe pass has to walk and gives more chances for an upstream
 * malformed dep to surface as an empty version comparison.
 *
 * This audit asserts:
 *
 *   1. The `colony` wrapper pins the exact version that
 *      `v3/@colony/cli` currently publishes (#3306).
 *
 *   2. The root `colony` umbrella's sibling deps that we maintain
 *      (`@colony/cli-core`, `@colony/mcp`, `@colony/neural`,
 *      `@colony/shared`) likewise include their actual published
 *      versions (best-effort — only when the corresponding workspace
 *      package.json is present locally).
 *
 *   3. The `colony` wrapper does NOT carry a pre-release range
 *      (`-alpha.N` / `-beta.N`) for `@colony/cli` once that package
 *      is publishing stable versions. Pre-release ranges on stable deps
 *      are the specific shape that caused #2127.
 *
 * Failure modes return non-zero with a clear remediation. Runs in CI on
 * every PR via v3-ci.yml `wrapper-dep-ranges-audit` job.
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import semver from 'semver';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

function readPkg(relPath) {
  const p = join(REPO_ROOT, relPath);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch (err) {
    return null;
  }
}

const violations = [];
const checks = [];

// ── 1. colony wrapper's @colony/cli dep range ────────────────────────────

const colonyPkg = readPkg('colony/package.json');
const cliPkg = readPkg('v3/@colony/cli/package.json');

if (!colonyPkg) {
  violations.push('colony/package.json not found');
} else if (!cliPkg) {
  violations.push('v3/@colony/cli/package.json not found');
} else {
  const cliVersion = cliPkg.version;
  const colonyDepRange = colonyPkg.dependencies?.['@colony/cli'];

  if (!colonyDepRange) {
    violations.push(
      `colony/package.json does not declare @colony/cli — wrapper must depend on the CLI it wraps`
    );
  } else {
    checks.push(`colony wraps @colony/cli with range "${colonyDepRange}" — cli published as ${cliVersion}`);

    // #3306: inclusion is insufficient: ^3.33.0 allowed a cached 3.33.0
    // implementation to sit behind a 3.41.2 wrapper and report as current.
    if (colonyDepRange !== cliVersion) {
      violations.push(
        `colony's "@colony/cli": "${colonyDepRange}" must pin the exact CLI ` +
        `version ${cliVersion} (no range).`
      );
    }

    // 1b. If the cli is on stable semver (no pre-release), the dep must not be on a pre-release range
    const cliPrerelease = semver.prerelease(cliVersion);
    const rangeUsesPrerelease = /-alpha\.|-beta\.|-rc\.|alpha\.\d+|beta\.\d+|rc\.\d+/.test(colonyDepRange);
    if (!cliPrerelease && rangeUsesPrerelease) {
      violations.push(
        `colony's "@colony/cli": "${colonyDepRange}" carries a pre-release tag but cli ${cliVersion} ` +
        `is on stable semver. Pre-release ranges widen the dedupe walk and have caused real-world ` +
        `crashes (see #1147 / #2018 / #2127). Replace with a plain caret range like "^${cliVersion}".`
      );
    }
  }
}

// ── 2. root colony umbrella sibling deps ────────────────────────────────

const rootPkg = readPkg('package.json');
const siblingsToCheck = [
  { dep: '@colony/cli-core', workspace: 'v3/@colony/cli-core/package.json' },
  { dep: '@colony/mcp',      workspace: 'v3/@colony/mcp/package.json' },
  { dep: '@colony/neural',   workspace: 'v3/@colony/neural/package.json' },
  { dep: '@colony/shared',   workspace: 'v3/@colony/shared/package.json' },
];

for (const { dep, workspace } of siblingsToCheck) {
  const wsPkg = readPkg(workspace);
  if (!wsPkg) continue; // best-effort — skip if workspace missing
  const range = rootPkg?.dependencies?.[dep];
  if (!range) continue;
  checks.push(`colony umbrella → ${dep}: range "${range}" — workspace at ${wsPkg.version}`);

  // Bundled internal runtimes are rebuilt from this exact source tree during
  // prepublish. Their registry range only bootstraps the release workspace;
  // the staged package replaces it in the public tarball.
  if (rootPkg?.bundleDependencies?.includes(dep)) {
    checks.push(`  ${dep} is source-bundled; registry/workspace version drift is expected`);
    continue;
  }

  if (!semver.satisfies(wsPkg.version, range, { includePrerelease: true })) {
    violations.push(
      `colony's "${dep}": "${range}" does NOT include the workspace's actual ` +
      `version ${wsPkg.version}. Bump the range.`
    );
  }
}

// ── 3. report ────────────────────────────────────────────────────────────────

console.log(`wrapper-dep-ranges audit — scanned ${checks.length} declaration(s)`);
for (const c of checks) console.log(`  ${c}`);

if (violations.length === 0) {
  console.log('  ok: colony pins its exact CLI version; other ranges include published targets');
  console.log('  ok: no pre-release ranges pointing at stable deps');
  process.exit(0);
}

console.error('\nviolations:');
for (const v of violations) console.error(`  ✗ ${v}`);
console.error(`\n${violations.length} violation(s) — see remediation hints above.`);
console.error('Reference: ruvnet/colony#2127 (Invalid Version dedupe crash).');
process.exit(1);

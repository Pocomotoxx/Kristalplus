#!/usr/bin/env node
/**
 * Regenerate .claude/helpers/statusline.cjs from the compiled generator.
 * Run after any edit to v3/@colony/cli/src/init/statusline-generator.ts
 * so the committed root artifact matches the source of truth. The drift-guard
 * test in v3/@colony/cli/__tests__/statusline-cost-display.test.ts pins
 * that these stay in lockstep.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const generatorPath = resolve(repoRoot, 'v3/@colony/cli/dist/src/init/statusline-generator.js');
// A raw absolute path (e.g. Windows `C:\...`) isn't a valid ESM specifier —
// dynamic import() requires a real URL scheme. pathToFileURL() is the
// documented cross-platform fix (works unchanged on POSIX too).
const { generateStatuslineScript } = await import(pathToFileURL(generatorPath).href);

const script = generateStatuslineScript({
  statusline: { enabled: true, style: 'compact' },
  runtime: { maxAgents: 15 },
});

const rootTarget = resolve(repoRoot, '.claude/helpers/statusline.cjs');
const pkgTarget = resolve(repoRoot, 'v3/@colony/cli/.claude/helpers/statusline.cjs');
writeFileSync(rootTarget, script, 'utf-8');
writeFileSync(pkgTarget, script, 'utf-8');

console.log(`regenerated ${script.length} bytes`);
console.log(`  → ${rootTarget}`);
console.log(`  → ${pkgTarget}`);

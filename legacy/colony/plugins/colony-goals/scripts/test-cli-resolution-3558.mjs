#!/usr/bin/env node
// #3558: research-list.mjs must run the colony CLI that is already installed,
// not `npx -y @colony/cli@latest` once per call (1 list + 1 per record).
//
// Hermetic: the plugin is copied into a temp marketplace-cache layout (no CLI
// beside it), and PATH holds only temp dirs with fake `colony` / `npx` scripts
// that log their argv and answer like the memory CLI.
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RECORD = JSON.stringify({ version: 1, question: 'q', status: 'done', findings: [], at: '2026-10-05T00:00:00Z' });

function fixture(fn) {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'colony-goals-cli-3558-')));
  try {
    const cache = join(tmp, 'home', '.claude', 'plugins', 'cache', 'colony', 'colony-goals', '0.0.0-test');
    cpSync(PLUGIN_ROOT, cache, { recursive: true });
    const log = join(tmp, 'calls.log');
    const fake = (dir, name) => {
      mkdirSync(dir, { recursive: true });
      const f = join(dir, name);
      writeFileSync(f, `#!/bin/sh\nprintf '%s %s\\n' "${name}" "$*" >> "${log}"\n` +
        `case "$*" in *"memory list"*) echo '[{"key":"research-1"}]' ;; *"memory retrieve"*) echo '${RECORD}' ;; esac\n`);
      chmodSync(f, 0o755);
    };
    const withColony = join(tmp, 'bin-colony'); fake(withColony, 'colony');
    const withNpx = join(tmp, 'bin-npx'); fake(withNpx, 'npx');
    const run = (pathDirs, env = {}) => {
      if (existsSync(log)) rmSync(log);
      const r = spawnSync(process.execPath, [join(cache, 'scripts', 'research-list.mjs')], {
        encoding: 'utf-8',
        env: { PATH: pathDirs.join(delimiter), HOME: join(tmp, 'home'), COLONY_PLUGIN_SKIP_LOCAL_CLI: '1', ...env },
      });
      assert.equal(r.status, 0, r.stderr);
      const calls = existsSync(log) ? readFileSync(log, 'utf-8').trim().split('\n') : [];
      return { out: JSON.parse(r.stdout), calls };
    };
    fn({ run, withColony, withNpx });
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

let passed = 0;
fixture(({ run, withColony, withNpx }) => {
  // 1. An installed colony on PATH serves the list and every retrieve; npx is never run.
  const a = run([withColony, withNpx]);
  assert.deepEqual(a.calls.map((c) => c.split(' ')[0]), ['colony', 'colony'], a.calls.join('\n'));
  assert.match(a.calls[0], /^colony memory list --namespace research/);
  assert.match(a.calls[1], /^colony memory retrieve --namespace research --key research-1/);
  assert.equal(a.out.records.length, 1, 'the record read through the installed CLI is listed');
  passed++;

  // 2. No colony installed: the unchanged npx -y @latest fallback.
  const b = run([withNpx]);
  assert.ok(b.calls.length === 2 && b.calls.every((c) => c.startsWith('npx -y @colony/cli@latest memory ')), b.calls.join('\n'));
  assert.equal(b.out.records.length, 1);
  passed++;

  // 3. The PATH step can be switched off (test seam shared with colony-adr).
  const c = run([withColony, withNpx], { COLONY_PLUGIN_SKIP_PATH_CLI: '1' });
  assert.ok(c.calls.every((x) => x.startsWith('npx ')), c.calls.join('\n'));
  passed++;
});
console.log(`research-list cli resolution (#3558): ${passed} passed`);

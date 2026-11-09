// #3558: adr-index / adr-reindex / adr-verify must run the colony CLI that is
// already installed, not `npx @colony/cli@latest`.
//
// A marketplace install copies the plugin to
// ~/.claude/plugins/cache/<marketplace>/colony-adr/<version>/ with no CLI next
// to it, so every store/purge/list went to npx @latest — possibly another CLI
// (and memory store) than the `colony memory search` that must find the
// records (#2781). Hermetic: the plugin is copied into a temp plugin-cache
// layout; PATH holds only temp dirs with fake `colony` / `npx` scripts that
// log their argv, plus a `node` link.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Support both the repository's Vitest collection and the standalone Node smoke.
const { test } = process.env.VITEST ? await import('vitest') : await import('node:test');

const PLUGIN_ROOT = fileURLToPath(new URL('../../', import.meta.url));

const write = (file, body, mode) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, body);
  if (mode) chmodSync(file, mode);
};

function withFixture(fn) {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'colony-adr-cli-tbd-')));
  try {
    const home = join(tmp, 'home');
    const cache = join(home, '.claude', 'plugins', 'cache', 'colony', 'colony-adr', '0.0.0-test');
    cpSync(PLUGIN_ROOT, cache, { recursive: true });
    const log = join(tmp, 'calls.log');
    const fake = (dir, name) => write(join(dir, name),
      `#!/bin/sh\nprintf '%s %s\\n' "${name}" "$*" >> "${log}"\ncase "$*" in *"memory list"*) echo '[]' ;; *) echo '[OK] done' ;; esac\n`, 0o755);
    const nodeBin = join(tmp, 'node-bin');
    mkdirSync(nodeBin);
    symlinkSync(process.execPath, join(nodeBin, 'node'));
    const colonyBin = join(tmp, 'bin-colony');
    fake(colonyBin, 'colony');
    const npxBin = join(tmp, 'bin-npx');
    fake(npxBin, 'npx');
    const project = join(tmp, 'project');
    mkdirSync(join(project, '.git'), { recursive: true });
    write(join(project, 'docs', 'adr', 'ADR-001-test.md'), '# ADR-001: Test\n\n**Status**: Accepted\n');

    const env = { ...process.env, HOME: home, USERPROFILE: home, ADR_ROOT: project };
    for (const k of ['CLI_CORE', 'COLONY_PLUGIN_SKIP_LOCAL_CLI', 'COLONY_PLUGIN_SKIP_PATH_CLI', 'IMPORT_DRY_RUN', 'REINDEX_DRY_RUN', 'NODE_OPTIONS']) delete env[k];
    const run = (script, extraEnv = {}, pluginRoot = cache) => {
      rmSync(log, { force: true });
      const r = spawnSync(process.execPath, [join(pluginRoot, 'scripts', script)], {
        cwd: project, encoding: 'utf-8', timeout: 30_000, env: { ...env, ...extraEnv },
      });
      // Multi-line --value= argv spills over lines; only CLI-name-prefixed lines are calls.
      const calls = existsSync(log) ? readFileSync(log, 'utf-8').split('\n').filter((l) => /^(colony|npx|shipping-cli) /.test(l)) : [];
      return { ...r, calls };
    };
    fn({ tmp, run, log, path: (...dirs) => [...dirs, nodeBin].join(delimiter), colonyBin, npxBin });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

test('win32: npm\'s colony.cmd shim maps to `node <package bin>`, never cmd.exe', async () => {
  const { findColonyOnPath } = await import(pathToFileURL(join(PLUGIN_ROOT, 'scripts', 'lib', 'colony-cli.mjs')).href);
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'colony-adr-cli-win-')));
  try {
    write(join(tmp, 'colony.cmd'), '@ECHO off\r\n');
    write(join(tmp, 'node_modules', 'colony', 'package.json'), JSON.stringify({ name: 'colony', bin: { colony: 'bin/colony.js' } }));
    write(join(tmp, 'node_modules', 'colony', 'bin', 'colony.js'), '');
    const hit = findColonyOnPath({ Path: tmp }, 'win32');
    assert.equal(hit?.command, process.execPath);
    assert.deepEqual(hit?.args, [realpathSync(join(tmp, 'node_modules', 'colony', 'bin', 'colony.js'))]);
    assert.equal(hit?.shell, false);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('win32: npx fallback resolves npm\'s JS entry, not the .cmd shim', async () => {
  const { resolveNpxCli } = await import(pathToFileURL(join(PLUGIN_ROOT, 'scripts', 'lib', 'colony-cli.mjs')).href);
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'colony-adr-npx-win-')));
  try {
    const bin = join(tmp, 'bin');
    const npmBin = join(bin, 'node_modules', 'npm', 'bin');
    const npxCli = join(npmBin, 'npx-cli.js');
    write(join(bin, 'npx.cmd'), '@ECHO off\r\n');
    write(npxCli, '');
    write(join(npmBin, 'npm-cli.js'), '');
    const fakeExecPath = join(tmp, 'node', 'node.exe');
    const want = realpathSync(npxCli);
    assert.equal(resolveNpxCli({ Path: bin }, 'win32', fakeExecPath), want);
    assert.equal(resolveNpxCli({ npm_execpath: join(npmBin, 'npm-cli.js') }, 'win32', fakeExecPath), want);
    assert.equal(resolveNpxCli({ Path: bin }, 'linux', fakeExecPath), null);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

if (process.platform !== 'win32') {
  test('plugin-cache install: import, reindex and verify all use the installed colony, never npx', () => withFixture(({ run, path, colonyBin, npxBin }) => {
    const env = { PATH: path(colonyBin, npxBin) };
    const imp = run('import.mjs', { ...env, IMPORT_FORMAT: 'json' });
    assert.equal(imp.status, 0, imp.stderr);
    assert.ok(imp.calls.some((l) => l.startsWith('colony memory store --namespace=adr-patterns --key=ADR-001::ADR-001-test --upsert --value=')), imp.calls.join(' | '));
    assert.deepEqual(imp.calls.filter((l) => l.startsWith('npx ')), []);

    const re = run('reindex.mjs', { ...env, REINDEX_FORMAT: 'json' });
    for (const cmd of ['colony memory purge --namespace=adr-patterns --force', 'colony memory store --namespace=adr-patterns', 'colony memory list --namespace adr-patterns']) {
      assert.ok(re.calls.some((l) => l.startsWith(cmd)), `reindex: expected "${cmd}" in ${re.calls.join(' | ')}`);
    }
    assert.deepEqual(re.calls.filter((l) => l.startsWith('npx ')), []);

    const ver = run('verify.mjs', { ...env, VERIFY_FORMAT: 'json' });
    assert.equal(ver.status, 0, ver.stderr);
    assert.ok(ver.calls.some((l) => l.startsWith('colony memory list --namespace=adr-patterns --format=json')), ver.calls.join(' | '));
    assert.deepEqual(ver.calls.filter((l) => l.startsWith('npx ')), []);
  }));

  test('no installed CLI: still `npx @colony/cli@latest` (unchanged fallback)', () => withFixture(({ run, path, npxBin }) => {
    const imp = run('import.mjs', { PATH: path(npxBin), IMPORT_FORMAT: 'json' });
    assert.equal(imp.status, 0, imp.stderr);
    assert.ok(imp.calls.some((l) => l.startsWith('npx @colony/cli@latest memory store --namespace=adr-patterns')), imp.calls.join(' | '));
  }));

  test('CLI_CORE=1 is still ignored (#2781): writer and reader stay on the same installed CLI', () => withFixture(({ run, path, colonyBin, npxBin }) => {
    const env = { PATH: path(colonyBin, npxBin), CLI_CORE: '1' };
    const imp = run('import.mjs', { ...env, IMPORT_FORMAT: 'json' });
    const ver = run('verify.mjs', { ...env, VERIFY_FORMAT: 'json' });
    assert.ok(imp.calls.some((l) => l.startsWith('colony memory store')), imp.calls.join(' | '));
    assert.ok(ver.calls.some((l) => l.startsWith('colony memory list')), ver.calls.join(' | '));
    assert.deepEqual([...imp.calls, ...ver.calls].filter((l) => l.includes('cli-core')), []);
  }));

  test('COLONY_PLUGIN_SKIP_PATH_CLI=1 skips the PATH lookup (test seam)', () => withFixture(({ run, path, colonyBin, npxBin }) => {
    const imp = run('import.mjs', { PATH: path(colonyBin, npxBin), COLONY_PLUGIN_SKIP_PATH_CLI: '1', IMPORT_FORMAT: 'json' });
    assert.ok(imp.calls.some((l) => l.startsWith('npx @colony/cli@latest memory store')), imp.calls.join(' | '));
    assert.deepEqual(imp.calls.filter((l) => l.startsWith('colony ')), []);
  }));

  test('published layout: a built @colony/cli next to the plugin wins over PATH', () => withFixture(({ tmp, run, log, path, colonyBin, npxBin }) => {
    const cli = join(tmp, 'published', 'node_modules', '@colony', 'cli');
    const plugin = join(cli, 'plugins', 'colony-adr');
    cpSync(PLUGIN_ROOT, plugin, { recursive: true });
    write(join(cli, 'package.json'), JSON.stringify({ name: '@colony/cli', version: '0.0.0-test', type: 'module' }));
    write(join(cli, 'dist', 'src', 'index.js'), 'export {};\n');
    write(join(cli, 'bin', 'cli.js'), `import { appendFileSync } from 'node:fs';\nappendFileSync(${JSON.stringify(log)}, 'shipping-cli ' + process.argv.slice(2).join(' ') + '\\n');\nconsole.log('[OK] done');\n`);
    const imp = run('import.mjs', { PATH: path(colonyBin, npxBin), IMPORT_FORMAT: 'json' }, plugin);
    assert.equal(imp.status, 0, imp.stderr);
    assert.ok(imp.calls.some((l) => l.startsWith('shipping-cli memory store --namespace=adr-patterns')), imp.calls.join(' | '));
    assert.deepEqual(imp.calls.filter((l) => !l.startsWith('shipping-cli ')), []);
  }));
}

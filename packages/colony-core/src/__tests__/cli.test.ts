import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runCommand } from '../cli/commands.js';

// A temp dir outside any git repo, so boot is UNVERIFIABLE (revision unknown) and deterministic.
let root: string;
before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'colony-cli-test-'));
});
after(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

async function project(name: string): Promise<(...args: string[]) => Promise<{ code: number; out: any }>> {
  const dir = path.join(root, name);
  await fs.mkdir(dir, { recursive: true });
  return async (...args) => {
    const { code, output } = await runCommand(args, dir);
    return { code, out: output as any };
  };
}

test('commands refuse to run before boot', async () => {
  const run = await project('noboot');
  const r = await run('status');
  assert.equal(r.code, 2);
  assert.match(r.out.error, /not booted/);
});

test('boot seeds the built-in members once and reports UNVERIFIABLE outside git', async () => {
  const run = await project('boot');
  const first = await run('boot');
  assert.equal(first.code, 0);
  assert.equal(first.out.boot.status, 'UNVERIFIABLE');
  assert.equal(first.out.boot.revision, 'unknown');
  assert.equal(first.out.colony.totalMembers, 6);
  assert.ok(first.out.protocol.length > 0);

  const second = await run('boot');
  assert.equal(second.out.colony.totalMembers, 6);
  assert.ok(second.out.boot.evidence.some((e: any) => e.path === '.colony/ledger.json' && /^[0-9a-f]{64}$/.test(e.sha256)));
});

test('a corrupt ledger blocks boot and revokes an earlier successful boot', async () => {
  const run = await project('corrupt');
  assert.equal((await run('boot')).code, 0);
  assert.equal((await run('status')).code, 0);

  await fs.writeFile(path.join(root, 'corrupt', '.colony', 'ledger.json'), '{ not json', 'utf-8');
  const blocked = await run('boot');
  assert.equal(blocked.code, 2);
  assert.equal(blocked.out.boot.status, 'BLOCKED');
  assert.ok(blocked.out.boot.problems.length > 0);

  const after = await run('status');
  assert.equal(after.code, 2);
  assert.match(after.out.error, /BLOCKED/);
});

test('a memory file that is not an array blocks boot', async () => {
  const run = await project('badmemory');
  await run('boot');
  await fs.writeFile(path.join(root, 'badmemory', '.colony', 'memory.json'), '{"a":1}', 'utf-8');
  const r = await run('boot');
  assert.equal(r.code, 2);
  assert.equal(r.out.boot.status, 'BLOCKED');
});

test('task lifecycle persists across invocations and done requires a real result', async () => {
  const run = await project('lifecycle');
  await run('boot');

  const added = await run('task', 'add', 'Write module', 'Implement a clean TypeScript module', '--role', 'engineer');
  assert.equal(added.out.task.status, 'assigned');
  const id = added.out.task.id;

  const next = await run('next', '--as', 'engineer');
  assert.equal(next.out.task.id, id);
  assert.equal(next.out.task.status, 'in_progress');
  assert.equal(typeof next.out.instructions, 'string');

  assert.equal((await run('done', id)).code, 1);
  assert.equal((await run('done', id, '--result', '   ')).code, 1);

  const done = await run('done', id, '--result', 'module written');
  assert.equal(done.code, 0);
  assert.equal(done.out.task.status, 'completed');

  const again = await run('done', id, '--result', 'twice');
  assert.equal(again.code, 1);
  assert.match(again.out.error, /not open/);

  const empty = await run('next', '--as', 'engineer');
  assert.equal(empty.out.task, null);
});

test('a dependent task is released only when its dependency is done', async () => {
  const run = await project('deps');
  await run('boot');
  const a = (await run('task', 'add', 'First', 'first step', '--role', 'engineer')).out.task.id;
  const b = await run('task', 'add', 'Second', 'second step', '--role', 'engineer', '--after', a);
  assert.equal(b.out.task.status, 'pending');

  const done = await run('done', a, '--result', 'ok');
  assert.deepEqual(done.out.unblocked.map((t: any) => t.id), [b.out.task.id]);
});

test('task add validates role, priority, dependencies and consensus', async () => {
  const run = await project('validate');
  await run('boot');
  assert.equal((await run('task', 'add', 't', 'd', '--role', 'wizard')).code, 1);
  assert.equal((await run('task', 'add', 't', 'd', '--priority', 'urgent')).code, 1);
  assert.match((await run('task', 'add', 't', 'd', '--after', 'nope')).out.error, /unknown dependency/);
  assert.equal((await run('task', 'add', 't', 'd', '--consensus', '0')).code, 1);
  assert.equal((await run('task', 'add', 't')).code, 1);
  assert.equal((await run('bogus')).code, 1);
});

test('a consensus task cannot be completed before its proposal is approved', async () => {
  const run = await project('consensus');
  await run('boot');
  const id = (await run('task', 'add', 'Risky', 'needs review', '--role', 'engineer', '--consensus', '2')).out.task.id;
  await run('next', '--as', 'engineer');

  const blocked = await run('done', id, '--result', 'x');
  assert.equal(blocked.code, 1);
  assert.match(blocked.out.error, /consensus/);

  const proposal = (await run('propose', id, 'ship it?', '--as', 'engineer')).out.proposal;
  assert.equal(proposal.status, 'open');
  assert.equal(proposal.quorum, 2);

  const noReason = await run('vote', proposal.id, '--as', 'reviewer', '--approve');
  assert.equal(noReason.code, 1);
  const both = await run('vote', proposal.id, '--as', 'reviewer', '--approve', '--reject', '--reason', 'r');
  assert.equal(both.code, 1);

  const v1 = await run('vote', proposal.id, '--as', 'reviewer', '--approve', '--reason', 'tests pass');
  assert.equal(v1.out.proposal.status, 'open');
  const v2 = await run('vote', proposal.id, '--as', 'tester', '--approve', '--reason', 'verified');
  assert.equal(v2.out.proposal.status, 'approved');
  assert.equal(v2.out.proposal.votes.length, 2);

  const done = await run('done', id, '--result', 'shipped');
  assert.equal(done.code, 0);
});

test('fail requires an error text and frees the member', async () => {
  const run = await project('fail');
  await run('boot');
  const id = (await run('task', 'add', 't', 'd', '--role', 'engineer')).out.task.id;
  assert.equal((await run('fail', id)).code, 1);
  const failed = await run('fail', id, '--error', 'cannot reproduce');
  assert.equal(failed.out.task.status, 'failed');
  const status = await run('status');
  assert.equal(status.out.members.find((m: any) => m.id === 'member_coder').status, 'idle');
});

test('memory add and search round-trip through the file store; completed work is remembered', async () => {
  const run = await project('memory');
  await run('boot');
  assert.equal((await run('memory', 'add', '')).code, 1);
  await run('memory', 'add', 'deploy pipeline uses blue green releases', '--ns', 'ops');

  const hit = await run('memory', 'search', 'blue green deploy pipeline', '--ns', 'ops', '--k', '1');
  assert.equal(hit.out.results.length, 1);
  assert.match(hit.out.results[0].text, /blue green/);
  assert.equal((await run('memory', 'search', 'x', '--k', '0')).code, 1);

  const id = (await run('task', 'add', 'Parse widgets', 'parse the widget feed', '--role', 'engineer')).out.task.id;
  await run('done', id, '--result', 'widget parser implemented');
  const learned = await run('memory', 'search', 'Parse widgets: parse the widget feed');
  assert.ok(learned.out.results.some((r: any) => /widget parser implemented/.test(r.text)));
});

test('next and vote reject an unknown role or member', async () => {
  const run = await project('unknown');
  await run('boot');
  assert.match((await run('next', '--as', 'wizard')).out.error, /no member or role/);
  assert.equal((await run('next')).code, 1);
});

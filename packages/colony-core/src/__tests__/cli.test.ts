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

test('commands run without boot and initialize built-in members on first use', async () => {
  const run = await project('noboot');
  const r = await run('status');
  assert.equal(r.code, 0);
  assert.equal(r.out.colony.totalMembers, 13);
  const added = await run('task', 'add', 'No boot needed', 'work starts directly', '--role', 'engineer');
  assert.equal(added.code, 0);
});

test('synthesize compares completed child reports without calling a model', async () => {
  const run = await project('synthesize');
  const created = await run('task', 'add', 'Research topic', 'x'.repeat(220), '--role', 'researcher');
  const parentId = created.out.task.id;
  const plan = await run('plan', parentId, '--kind', 'research', '--apply');
  assert.equal(plan.code, 0);
  assert.equal(plan.out.children.length, 4);

  const results = [
    'Sources show stable patterns and a reliable baseline.',
    'Evidence shows stable patterns with a reliable baseline.',
    'The report supports stable patterns and a reliable baseline.',
    'Verification confirms a reliable baseline and stable patterns.',
  ];
  for (const [index, child] of plan.out.children.entries()) {
    const next = await run('next', '--as', child.requiredRole);
    assert.equal(next.code, 0);
    assert.equal(next.out.task.id, child.id);
    assert.equal((await run('done', child.id, '--result', results[index])).code, 0);
  }

  const synthesis = await run('synthesize', parentId);
  assert.equal(synthesis.code, 0);
  assert.equal(synthesis.out.synthesis.heuristic, true);
  assert.equal(synthesis.out.synthesis.reports.length, 4);
  assert.ok(synthesis.out.synthesis.agreement.terms.includes('stable'));
});

test('boot seeds the built-in members once and reports UNVERIFIABLE outside git', async () => {
  const run = await project('boot');
  const first = await run('boot');
  assert.equal(first.code, 0);
  assert.equal(first.out.boot.status, 'UNVERIFIABLE');
  assert.equal(first.out.boot.revision, 'unknown');
  assert.equal(first.out.colony.totalMembers, 13);
  assert.ok(first.out.protocol.length > 0);

  const second = await run('boot');
  assert.equal(second.out.colony.totalMembers, 13);
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
  assert.equal(after.code, 1); // malformed state remains an error; the boot record is not a gate
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


test('custom members carry domain and release specializations into task matching', async () => {
  const run = await project('specializations');
  const domain = await run('member', 'add', 'Payments specialist', '--role', 'custom', '--specializations', 'domain:payments');
  assert.equal(domain.code, 0);
  const release = await run('member', 'add', 'Release operator', '--role', 'custom', '--specializations', 'release-operations');
  assert.equal(release.code, 0);
  const members = (await run('member', 'list')).out.members;
  assert.deepEqual(members.find((member: any) => member.id === domain.out.member.id).specializations, ['domain:payments']);
  assert.deepEqual(members.find((member: any) => member.id === release.out.member.id).specializations, ['release-operations']);
  const domainTask = await run('task', 'add', 'Review payment rules', 'check payment behavior', '--role', 'custom', '--capabilities', 'domain:payments');
  assert.equal(domainTask.out.task.assignedAgentId, domain.out.member.id);
  const nextDomain = await run('next', '--as', domain.out.member.id);
  assert.deepEqual(nextDomain.out.member.specializations, ['domain:payments']);
  const releaseTask = await run('task', 'add', 'Prepare rollout', 'check rollback and monitoring', '--role', 'custom', '--capabilities', 'release-operations');
  assert.equal(releaseTask.out.task.assignedAgentId, release.out.member.id);
  assert.match((await run('task', 'add', 'Bad specialization', 'x', '--capabilities', 'domain:bad slug')).out.error, /unknown specialization/);
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

  assert.equal(proposal.phase, 'discussion');
  const beforeDebateVote = await run('vote', proposal.id, '--as', 'reviewer', '--approve', '--reason', 'too soon');
  assert.match(beforeDebateVote.out.error, /discussion is not finalized/);
  const position = await run('debate', proposal.id, 'position', '--as', 'reviewer', '--text', 'Keep the release behind the test gate');
  assert.equal(position.code, 0);
  const reply = await run('debate', proposal.id, 'reply', '--as', 'tester', '--to', position.out.entry.id, '--mode', 'courtroom', '--text', 'The integration suite is still missing');
  assert.equal(reply.code, 0);
  assert.equal(reply.out.entry.mode, 'courtroom');
  const challenger = (await run('member', 'list')).out.members.find((member: any) => member.profileId === 'profile_concerned_challenger');
  assert.deepEqual(challenger.debateModes, { default: 'quarrel', alternate: 'courtroom' });
  const ordinaryQuarrel = await run('debate', proposal.id, 'position', '--as', 'engineer', '--mode', 'quarrel', '--text', 'I want to quarrel');
  assert.match(ordinaryQuarrel.out.error, /may use only its default/);
  const challenge = await run('debate', proposal.id, 'position', '--as', challenger.id, '--mode', 'quarrel', '--text', 'This leaves an unhandled rollback risk');
  assert.equal(challenge.out.entry.mode, 'quarrel');
  const final = await run('debate', proposal.id, 'finalize', '--as', 'engineer', '--text', 'Release only after integration tests pass');
  assert.equal(final.out.proposal.phase, 'voting');

  const outsider = await run('member', 'add', 'Late voter', '--role', 'custom');
  const excluded = await run('vote', proposal.id, '--as', outsider.out.member.id, '--approve', '--reason', 'joined late');
  assert.match(excluded.out.error, /frozen electorate/);

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

test('propose --strategy derives the quorum from the active members and validates its input', async () => {
  const run = await project('strategy');
  await run('boot');
  const id = (await run('task', 'add', 'Risky', 'needs review', '--role', 'engineer', '--consensus', '2')).out.task.id;
  await run('next', '--as', 'engineer');

  assert.match((await run('propose', id, 't', '--as', 'engineer', '--strategy', 'gut-feeling')).out.error, /unknown strategy/);
  assert.match((await run('propose', id, 't', '--as', 'engineer', '--strategy', 'majority', '--quorum', '2')).out.error, /not both/);

  const byz = await run('propose', id, 'ship it?', '--as', 'engineer', '--strategy', 'byzantine');
  assert.equal(byz.out.proposal.voters, 11); // thirteen built-in agents; Mother and the exobiologist do not vote
  assert.equal(byz.out.proposal.quorum, 8); // f = 3 for eleven voters, quorum floor(14 / 2) + 1

  const maj = (await run('propose', id, 'again?', '--as', 'engineer', '--strategy', 'majority')).out.proposal;
  assert.equal(maj.quorum, 6);
  const majPosition = await run('debate', maj.id, 'position', '--as', 'reviewer', '--text', 'Support based on current checks');
  await run('debate', maj.id, 'reply', '--as', 'tester', '--to', majPosition.out.entry.id, '--text', 'The tested path is covered');
  await run('debate', maj.id, 'finalize', '--as', 'engineer', '--text', 'Approve after current checks');
  for (const who of ['reviewer', 'tester', 'security', 'architect']) {
    await run('vote', maj.id, '--as', who, '--approve', '--reason', 'checked');
  }
  await run('vote', maj.id, '--as', 'member_auditor', '--approve', '--reason', 'checked');
  const last = await run('vote', maj.id, '--as', 'analyst', '--approve', '--reason', 'numbers hold');
  assert.equal(last.out.proposal.status, 'approved');
  assert.equal((await run('done', id, '--result', 'shipped')).code, 0);
});

test('weighted proposal records Colony performance and health weights in votes and audit', async () => {
  const run = await project('weighted-strategy');
  const id = (await run('task', 'add', 'Weighted decision', 'needs weighted review', '--role', 'engineer', '--consensus', '2')).out.task.id;
  const proposal = (await run('propose', id, 'accept?', '--as', 'engineer', '--strategy', 'weighted')).out.proposal;
  assert.equal(proposal.strategy, 'weighted');
  assert.equal(Object.keys(proposal.voterWeights).length, proposal.voters);
  const recordedWeight = Object.values(proposal.voterWeights as Record<string, number>).reduce((a, b) => a + b, 0);
  assert.ok(proposal.quorum > recordedWeight / 2);
  const position = await run('debate', proposal.id, 'position', '--as', 'reviewer', '--text', 'The criteria are met');
  await run('debate', proposal.id, 'reply', '--as', 'tester', '--to', position.out.entry.id, '--text', 'The test evidence agrees');
  await run('debate', proposal.id, 'finalize', '--as', 'engineer', '--text', 'Accept with the recorded safeguards');
  const reviewerId = (await run('member', 'list')).out.members.find((member: any) => member.role === 'reviewer').id;
  const vote = await run('vote', proposal.id, '--as', reviewerId, '--approve', '--reason', 'reviewed');
  assert.equal(vote.code, 0);
  assert.equal(vote.out.voteWeight, proposal.voterWeights[reviewerId]);
  assert.equal(vote.out.proposal.votes[0].weight, vote.out.voteWeight);
  assert.equal(vote.out.proposal.status, 'open');
});


test('Mother is available as an evidence-only LLM advisor but cannot debate, vote or take tasks', async () => {
  const run = await project('mother-advisor');
  const members = (await run('member', 'list')).out.members;
  const mother = members.find((member: any) => member.id === 'member_mother');
  assert.ok(mother);
  assert.equal(mother.role, 'mother');
  assert.equal(mother.debateModes, null);

  const rejectedTask = await run('task', 'add', 'Ask Mother to do work', 'Mother only advises', '--role', 'mother');
  assert.match(rejectedTask.out.error, /does not take tasks/);

  const task = (await run('task', 'add', 'Assess heat risk', 'Review supplied evidence', '--role', 'engineer', '--consensus', '2')).out.task;
  const next = await run('next', '--as', 'engineer');
  assert.equal(next.out.advisorChannel.advisorMemberId, 'member_mother');
  const proposal = (await run('propose', task.id, 'Use evidence-based adaptation', '--as', 'engineer', '--strategy', 'majority')).out.proposal;
  assert.equal(proposal.voters, 11);
  assert.equal(proposal.eligibleVoterIds.includes('member_mother'), false);
  assert.deepEqual(proposal.forumAdvisor, {
    memberId: 'member_mother',
    profileId: 'profile_mother',
    name: 'Mother',
    role: 'mother',
    participatesInDiscussion: false,
    participatesInVoting: false,
    canBeAsked: true,
  });

  const ask = await run('mother', 'ask', '--as', 'engineer', '--question', 'Which supplied evidence supports this risk?', '--task', task.id, '--proposal', proposal.id);
  assert.equal(ask.code, 0);
  assert.equal(ask.out.request.advisor.outsideDebate, true);
  assert.equal(ask.out.request.samplingAdvice.temperature, 0);
  assert.equal(ask.out.request.question, 'Which supplied evidence supports this risk?');
  assert.equal(ask.out.request.evidence.task.id, task.id);
  assert.equal(ask.out.request.evidence.proposal.id, proposal.id);
  assert.match(ask.out.request.responseContract.authority, /Do not debate, vote/);
  assert.match(ask.out.note, /host to execute with Mother/);

  const position = await run('debate', proposal.id, 'position', '--as', 'reviewer', '--text', 'Keep the test gate');
  await run('debate', proposal.id, 'reply', '--as', 'tester', '--to', position.out.entry.id, '--text', 'The evidence is incomplete');
  await run('debate', proposal.id, 'finalize', '--as', 'engineer', '--text', 'Keep the test gate until evidence is complete');
  const motherVote = await run('vote', proposal.id, '--as', 'member_mother', '--approve', '--reason', 'advice');
  assert.match(motherVote.out.error, /not an eligible voter/);
});

test('member sweep expires temporary members and makes their work recoverable', async () => {
  const run = await project('ephemeral-member');
  const created = await run('member', 'add', 'Short-lived helper', '--role', 'custom', '--ephemeral', '--ttl-min', '0.0002'); assert.equal(created.code, 0);
  const memberId = created.out.member.id;
  const added = await run('task', 'add', 'Temporary work', 'can be reassigned', '--role', 'custom'); assert.equal(added.out.task.assignedAgentId, memberId);
  const next = await run('next', '--as', memberId); assert.equal(next.out.task.id, added.out.task.id);
  await new Promise(resolve => setTimeout(resolve, 30));
  const swept = await run('member', 'sweep'); assert.equal(swept.code, 0); assert.equal(swept.out.expired[0].memberId, memberId);
  assert.deepEqual(swept.out.expired[0].markedStealable, [added.out.task.id]);
  assert.equal((await run('claim', 'list')).out.claims[0].status, 'stealable');
  assert.equal((await run('member', 'list')).out.members.find((m: any) => m.id === memberId).status, 'offline');
  assert.deepEqual((await run('member', 'sweep')).out.expired, []);
});

test('member sweep requeues an unstarted temporary assignment', async () => {
  const run = await project('ephemeral-unstarted');
  const created = await run('member', 'add', 'Short-lived helper', '--role', 'custom', '--ephemeral', '--ttl-min', '0.0002'); const memberId = created.out.member.id;
  const added = await run('task', 'add', 'Queued after expiry', 'not started yet', '--role', 'custom'); assert.equal(added.out.task.assignedAgentId, memberId);
  await new Promise(resolve => setTimeout(resolve, 30));
  const swept = await run('member', 'sweep'); assert.deepEqual(swept.out.expired[0].requeued, [added.out.task.id]);
  assert.equal((await run('status')).out.tasks.find((t: any) => t.id === added.out.task.id).status, 'pending');
});

test('topology prints the graph, finds paths and validates its options', async () => {
  const run = await project('topology');
  await run('boot');

  const star = await run('topology');
  assert.equal(star.out.topology.leader, 'member_director');
  assert.equal(star.out.topology.edges.length, 12);
  assert.equal(star.out.connected, true);

  const tree = await run('topology', '--type', 'tree', '--fanout', '2', '--from', 'member_security', '--to', 'member_tester');
  assert.equal(tree.out.path[0], 'member_security');
  assert.equal(tree.out.path.at(-1), 'member_tester');
  assert.ok(tree.out.path.length >= 2);

  assert.match((await run('topology', '--type', 'ring')).out.error, /unknown topology/);
  assert.equal((await run('topology', '--fanout', '0')).code, 1);
  assert.match((await run('topology', '--from', 'member_tester')).out.error, /go together/);
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
  const entry = learned.out.results.find((r: any) => /widget parser implemented/.test(r.text));
  assert.ok(entry);
  // The colony only records what the host reported; it must not label that "verified".
  assert.match(entry.text, /Reported Solution Strategy/);
  assert.doesNotMatch(entry.text, /Verified/);
});

const rulesPath = (name: string, file = '') => path.join(root, name, '.colony', 'rules', file);

test('first boot seeds the starter rules and returns their text with hashes', async () => {
  const run = await project('rules-seed');
  const r = await run('boot');
  assert.equal(r.code, 0);
  assert.equal(r.out.rules.length, 3);
  assert.ok(r.out.rules.every((x: any) => /^[0-9a-f]{64}$/.test(x.sha256) && x.text.length > 0));
  assert.deepEqual(
    r.out.boot.rules.map((x: any) => x.path),
    r.out.rules.map((x: any) => x.path)
  );
  assert.ok((await fs.readdir(rulesPath('rules-seed'))).includes('manifest.json'));
});

test('a project-edited rule survives a re-boot (starter rules never overwrite)', async () => {
  const run = await project('rules-edit');
  await run('boot');
  await fs.writeFile(rulesPath('rules-edit', '00-protocol.md'), '# Saját szabály\n', 'utf-8');
  const r = await run('boot');
  assert.equal(r.code, 0);
  assert.ok(r.out.rules.some((x: any) => x.text === '# Saját szabály\n'));
});

test('editing a rule after boot reports drift without blocking work', async () => {
  const run = await project('rules-drift');
  await run('boot');
  assert.equal((await run('status')).code, 0);

  await fs.appendFile(rulesPath('rules-drift', '10-evidence.md'), '- extra sor\n', 'utf-8');
  const drift = await run('status');
  assert.equal(drift.code, 0);
  assert.ok(drift.out.warnings.some((warning: string) => /rule files changed/.test(warning)));

  assert.equal((await run('boot')).code, 0);
  assert.equal((await run('status')).code, 0);
});

test('a missing, empty or out-of-directory mandatory rule blocks boot', async () => {
  const run = await project('rules-missing');
  await run('boot');

  await fs.rm(rulesPath('rules-missing', '20-consensus.md'));
  const missing = await run('boot');
  assert.equal(missing.code, 2);
  assert.equal(missing.out.boot.status, 'BLOCKED');
  assert.match(missing.out.boot.problems.join(' '), /20-consensus\.md/);
  assert.equal(missing.out.rules, undefined);
  assert.equal((await run('status')).code, 0);

  await fs.writeFile(rulesPath('rules-missing', '20-consensus.md'), '   \n', 'utf-8');
  assert.match((await run('boot')).out.boot.problems.join(' '), /empty rule file/);

  await fs.writeFile(
    rulesPath('rules-missing', 'manifest.json'),
    JSON.stringify({ version: 1, mandatory: ['../ledger.json'] }),
    'utf-8'
  );
  assert.match((await run('boot')).out.boot.problems.join(' '), /outside the rules directory/);

  await fs.writeFile(rulesPath('rules-missing', 'manifest.json'), '{ nope', 'utf-8');
  assert.equal((await run('boot')).out.boot.status, 'BLOCKED');
});

test('next and vote reject an unknown role or member', async () => {
  const run = await project('unknown');
  await run('boot');
  assert.match((await run('next', '--as', 'wizard')).out.error, /no member or role/);
  assert.equal((await run('next')).code, 1);
});

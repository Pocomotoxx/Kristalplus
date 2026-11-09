import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MessageBus } from '../message-bus.js';
import { ConsensusEngine } from '../consensus/consensus-engine.js';
import { InMemoryVectorStore, cosineSimilarity } from '../memory/vector-store.js';

const newEngine = () => new ConsensusEngine(new MessageBus());
const base = { taskId: 't', proposerId: 'p', topic: 'x', data: {} };

async function readyProposal(
  engine: ConsensusEngine,
  options: {
    quorum?: number;
    timeoutMs?: number;
    strategy?: 'weighted';
    voters?: number;
    voterWeights?: Record<string, number>;
    eligibleVoterIds?: string[];
  } = {},
) {
  const eligibleVoterIds = options.eligibleVoterIds ?? ['a', 'b', 'c', 'p'];
  const eligibleVoterRoles = Object.fromEntries(eligibleVoterIds.map((id) => [id, 'custom' as const]));
  const eligibleVoterProfileIds = Object.fromEntries(eligibleVoterIds.map((id) => [id, null]));
  const proposal = await engine.submitProposal({ ...base, ...options, voters: eligibleVoterIds.length, eligibleVoterIds, eligibleVoterRoles, eligibleVoterProfileIds });
  engine.addDiscussionEntry(proposal.id, { authorId: eligibleVoterIds[0], kind: 'position', mode: 'rational', text: 'Initial position' });
  engine.addDiscussionEntry(proposal.id, { authorId: eligibleVoterIds[1], kind: 'reply', mode: 'fact-finding', replyTo: engine.getProposal(proposal.id)!.discussion![0].id, text: 'Consider the counterpoint' });
  engine.finalizeDiscussion(proposal.id, 'p', 'Final decision text');
  return proposal;
}

test('Consensus approves once approvals reach the quorum', async () => {
  const engine = newEngine();
  const p = await readyProposal(engine, { quorum: 2 });

  await engine.castVote(p.id, { voterId: 'a', approve: true });
  assert.equal(engine.getProposal(p.id)?.status, 'open');
  await engine.castVote(p.id, { voterId: 'b', approve: true });
  assert.equal(engine.getProposal(p.id)?.status, 'approved');
});

test('Consensus rejects when a majority rejects and enough votes are in', async () => {
  const engine = newEngine();
  const p = await readyProposal(engine, { quorum: 2 });

  await engine.castVote(p.id, { voterId: 'a', approve: false });
  assert.equal(engine.getProposal(p.id)?.status, 'open');
  await engine.castVote(p.id, { voterId: 'b', approve: false });
  assert.equal(engine.getProposal(p.id)?.status, 'open');
  await engine.castVote(p.id, { voterId: 'c', approve: false });
  assert.equal(engine.getProposal(p.id)?.status, 'rejected');
});

test('Consensus: a voter counts once and votes after finalization throw', async () => {
  const engine = newEngine();
  const p = await readyProposal(engine, { quorum: 2 });

  await engine.castVote(p.id, { voterId: 'a', approve: true });
  await engine.castVote(p.id, { voterId: 'a', approve: true });
  assert.equal(engine.getProposal(p.id)?.status, 'open');

  await engine.castVote(p.id, { voterId: 'b', approve: true });
  await assert.rejects(() => engine.castVote(p.id, { voterId: 'c', approve: true }), /already finalized/);
  await assert.rejects(() => engine.castVote('missing', { voterId: 'a', approve: true }), /not found/);
});

test('Consensus marks an expired proposal as timeout', async () => {
  const engine = newEngine();
  const p = await readyProposal(engine, { timeoutMs: 1 });
  await new Promise((r) => setTimeout(r, 15));

  await engine.castVote(p.id, { voterId: 'a', approve: true });
  assert.equal(engine.getProposal(p.id)?.status, 'timeout');
});

test('weighted consensus applies the frozen member weights, not vote count', async () => {
  const engine = newEngine();
  await assert.rejects(
    () => engine.submitProposal({ ...base, strategy: 'weighted', voters: 0, eligibleVoterIds: [], eligibleVoterRoles: {}, eligibleVoterProfileIds: {}, voterWeights: {} }),
    /at least two unique eligible voter IDs/
  );
  const p = await readyProposal(engine, { strategy: 'weighted', voters: 3, eligibleVoterIds: ['strong', 'medium', 'light'], voterWeights: { strong: 0.6, medium: 0.25, light: 0.15 } });
  assert.equal(p.quorum, 0.5 + Number.EPSILON);
  await assert.rejects(() => engine.castVote(p.id, { voterId: 'outsider', approve: true }), /not an eligible voter/);
  const result = await engine.castVote(p.id, { voterId: 'strong', approve: true });
  assert.equal(result.status, 'approved');
  assert.equal(result.votes.get('strong')?.weight, 0.6);
  const restored = newEngine();
  restored.restore(engine.snapshot());
  assert.equal(restored.getProposal(p.id)?.voterWeights?.strong, 0.6);
});

test('weighted consensus rejects when remaining possible approval weight misses quorum', async () => {
  const engine = newEngine();
  const p = await readyProposal(engine, { strategy: 'weighted', voters: 3, eligibleVoterIds: ['a', 'b', 'c'], voterWeights: { a: 0.4, b: 0.35, c: 0.25 } });
  await engine.castVote(p.id, { voterId: 'a', approve: true });
  assert.equal(engine.getProposal(p.id)?.status, 'open');
  await engine.castVote(p.id, { voterId: 'b', approve: false });
  assert.equal(engine.getProposal(p.id)?.status, 'open');
  const rejected = await engine.castVote(p.id, { voterId: 'c', approve: false });
  assert.equal(rejected.status, 'rejected');
});


test('discussion is ordered, replies target positions, and all strategies enforce a frozen electorate', async () => {
  const engine = newEngine();
  const eligibleVoterIds = ['p', 'a', 'b'];
  const eligibleVoterRoles = Object.fromEntries(eligibleVoterIds.map((id) => [id, id === 'b' ? 'writer' as const : 'custom' as const]));
  const eligibleVoterProfileIds = Object.fromEntries(eligibleVoterIds.map((id) => [id, null]));
  const proposal = await engine.submitProposal({ ...base, eligibleVoterIds, eligibleVoterRoles, eligibleVoterProfileIds });
  await assert.rejects(() => engine.castVote(proposal.id, { voterId: 'a', approve: true }), /discussion is not finalized/);
  assert.throws(
    () => engine.addDiscussionEntry(proposal.id, { authorId: 'outsider', kind: 'position', mode: 'rational', text: 'Outside view' }),
    /frozen electorate/,
  );
  assert.throws(
    () => engine.addDiscussionEntry(proposal.id, { authorId: 'a', kind: 'position', mode: 'quarrel', text: 'Not permitted' }),
    /not available to member/,
  );
  const position = engine.addDiscussionEntry(proposal.id, { authorId: 'a', kind: 'position', mode: 'rational', text: 'Keep the change' });
  assert.throws(
    () => engine.addDiscussionEntry(proposal.id, { authorId: 'a', kind: 'reply', mode: 'rational', replyTo: position.id, text: 'Self reply' }),
    /own position/,
  );
  assert.throws(() => engine.finalizeDiscussion(proposal.id, 'p', 'Too early'), /at least one reply/);
  assert.throws(() => engine.addDiscussionEntry(proposal.id, { authorId: 'a', kind: 'position', mode: 'rational', text: 'Second position' }), /only one position/);
  const reply = engine.addDiscussionEntry(proposal.id, { authorId: 'b', kind: 'reply', mode: 'negotiation', replyTo: position.id, text: 'Add a rollback plan' });
  assert.equal(reply.replyTo, position.id);
  assert.throws(() => engine.finalizeDiscussion(proposal.id, 'a', 'Not the proposer'), /only the proposer/);
  engine.finalizeDiscussion(proposal.id, 'p', 'Ship with rollback');
  await assert.rejects(() => engine.castVote(proposal.id, { voterId: 'outsider', approve: true }), /frozen electorate/);
  assert.equal((await engine.castVote(proposal.id, { voterId: 'a', approve: true })).phase, 'voting');
  const restored = newEngine();
  restored.restore(engine.snapshot());
  assert.deepEqual(restored.getProposal(proposal.id)?.eligibleVoterIds, ['p', 'a', 'b']);
  assert.equal(restored.getProposal(proposal.id)?.discussion?.length, 2);
  assert.equal(restored.getProposal(proposal.id)?.finalProposal, 'Ship with rollback');
});


test('only the concerned challenger profile can use the quarrel debate mode', async () => {
  const engine = newEngine();
  const ids = ['concerned', 'peer'];
  const proposal = await engine.submitProposal({
    ...base,
    eligibleVoterIds: ids,
    eligibleVoterRoles: { concerned: 'auditor', peer: 'auditor' },
    eligibleVoterProfileIds: { concerned: 'profile_concerned_challenger', peer: 'profile_auditor' },
  });
  const entry = engine.addDiscussionEntry(proposal.id, {
    authorId: 'concerned', kind: 'position', mode: 'quarrel', text: 'This release path has an unhandled failure chain.',
  });
  assert.equal(entry.mode, 'quarrel');
  assert.throws(
    () => engine.addDiscussionEntry(proposal.id, { authorId: 'peer', kind: 'position', mode: 'quarrel', text: 'I also quarrel' }),
    /not available to member/,
  );
});

test('cosineSimilarity: identical, orthogonal, zero vector, dimension mismatch', () => {
  assert.ok(Math.abs(cosineSimilarity([1, 2, 3], [1, 2, 3]) - 1) < 1e-9);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.equal(cosineSimilarity([0, 0], [1, 1]), 0);
  assert.throws(() => cosineSimilarity([1], [1, 2]), /dimension mismatch/);
});

test('InMemoryVectorStore ranks by similarity, honours topK, minScore and namespace', async () => {
  const store = new InMemoryVectorStore();
  await store.upsert([
    { id: 'near', text: 'near', vector: [1, 0], namespace: 'n1', createdAt: 1 },
    { id: 'mid', text: 'mid', vector: [1, 1], namespace: 'n1', createdAt: 1 },
    { id: 'far', text: 'far', vector: [0, 1], namespace: 'n2', createdAt: 1 },
    { id: 'novec', text: 'no vector', namespace: 'n1', createdAt: 1 },
  ]);

  const all = await store.search([1, 0], { topK: 10 });
  assert.deepEqual(all.map((r) => r.document.id), ['near', 'mid', 'far']);

  assert.deepEqual((await store.search([1, 0], { topK: 1 })).map((r) => r.document.id), ['near']);
  assert.deepEqual((await store.search([1, 0], { namespace: 'n2' })).map((r) => r.document.id), ['far']);
  assert.deepEqual((await store.search([1, 0], { minScore: 0.9 })).map((r) => r.document.id), ['near']);
});

test('InMemoryVectorStore count, delete and clear by namespace', async () => {
  const store = new InMemoryVectorStore();
  await store.upsert([
    { id: 'a', text: '', vector: [1], namespace: 'n1', createdAt: 1 },
    { id: 'b', text: '', vector: [1], namespace: 'n2', createdAt: 1 },
    { id: 'c', text: '', vector: [1], namespace: 'n2', createdAt: 1 },
  ]);
  assert.equal(await store.count(), 3);
  assert.equal(await store.count('n2'), 2);

  await store.delete(['a']);
  assert.equal(await store.count(), 2);

  await store.clear('n2');
  assert.equal(await store.count(), 0);
});

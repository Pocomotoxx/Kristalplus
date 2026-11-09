import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConsensusEngine } from '../consensus/consensus-engine.js';
import { MessageBus } from '../message-bus.js';

async function createProposal() {
  const engine = new ConsensusEngine(new MessageBus());
  const proposal = await engine.submitProposal({
    taskId: 'task-sybil',
    proposerId: 'v1',
    topic: 'identity independence',
    data: {},
    strategy: 'byzantine',
    voters: 4,
  });
  return { engine, proposalId: proposal.id };
}

test('Byzantine quorum counts the same execution context once and exposes independence evidence', async () => {
  const shared = await createProposal();
  for (const voterId of ['v1', 'v2', 'v3', 'v4']) {
    await shared.engine.castVote(shared.proposalId, {
      voterId, approve: true, executionContextId: 'one-host-session',
    });
  }

  const independent = await createProposal();
  for (const [index, voterId] of ['v1', 'v2', 'v3', 'v4'].entries()) {
    await independent.engine.castVote(independent.proposalId, {
      voterId, approve: index !== 2, executionContextId: `execution-${index}`,
    });
  }

  const sharedProposal = shared.engine.getProposal(shared.proposalId)!;
  const independentProposal = independent.engine.getProposal(independent.proposalId)!;
  assert.equal(sharedProposal.votes.size, 4);
  assert.equal(sharedProposal.status, 'rejected');
  assert.equal(sharedProposal.independenceProof?.distinctExecutionContexts, 1);
  assert.equal(sharedProposal.independenceProof?.identityConfidence, 0.25);
  assert.equal(sharedProposal.independenceProof?.cryptographicAttestation, false);

  assert.equal(independentProposal.votes.size, 4);
  assert.equal(independentProposal.status, 'approved');
  assert.equal(independentProposal.independenceProof?.distinctExecutionContexts, 4);
  assert.equal(independentProposal.independenceProof?.identityConfidence, 1);
  assert.equal(independent.engine.snapshot()[0].independenceProof?.status, 'claimed_distinct');
});

test('vote confidence is bounded advisory metadata', async () => {
  const { engine, proposalId } = await createProposal();
  for (const confidence of [-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY]) {
    await assert.rejects(
      engine.castVote(proposalId, { voterId: 'v1', approve: true, confidence }),
      /confidence must be a finite number between 0 and 1/,
    );
  }
  assert.equal(engine.getProposal(proposalId)!.votes.size, 0);
});

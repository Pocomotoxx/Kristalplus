import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConsensusEngine } from '../consensus/consensus-engine.js';
import { MessageBus } from '../message-bus.js';

async function runVoteSet(contextIds: string[]) {
  const engine = new ConsensusEngine(new MessageBus());
  const voters = ['v1', 'v2', 'v3', 'v4'];
  const proposal = await engine.submitProposal({
    taskId: 'task-sybil',
    proposerId: voters[0],
    topic: 'independence check',
    data: {},
    strategy: 'byzantine',
    voters: 4,
    eligibleVoterIds: voters,
    eligibleVoterRoles: Object.fromEntries(voters.map((id) => [id, 'custom'] as const)),
    eligibleVoterProfileIds: Object.fromEntries(voters.map((id) => [id, null] as const)),
  });
  const position = engine.addDiscussionEntry(proposal.id, {
    authorId: 'v1', kind: 'position', mode: 'rational', text: 'Approve proposal.',
  });
  engine.addDiscussionEntry(proposal.id, {
    authorId: 'v2', kind: 'reply', mode: 'rational', replyTo: position.id, text: 'Reviewed.',
  });
  engine.finalizeDiscussion(proposal.id, 'v1', 'Final proposal.');

  for (const [index, voterId] of voters.entries()) {
    await engine.castVote(proposal.id, {
      voterId,
      approve: index !== 2,
      executionContextId: contextIds[index],
    });
  }
  return engine;
}

test('Byzantine quorum counts a shared host execution context once and exposes the evidence', async () => {
  const shared = await runVoteSet(['host-session-A', 'host-session-A', 'host-session-A', 'host-session-A']);
  const independent = await runVoteSet(['session-A', 'session-B', 'session-C', 'session-D']);

  const sharedProposal = shared.getProposal(shared.snapshot()[0].id)!;
  const independentProposal = independent.getProposal(independent.snapshot()[0].id)!;

  assert.equal(sharedProposal.votes.size, 4);
  assert.equal(sharedProposal.status, 'rejected');
  assert.equal(sharedProposal.independenceProof?.distinctExecutionContexts, 1);
  assert.equal(sharedProposal.independenceProof?.identityConfidence, 0.25);
  assert.equal(sharedProposal.independenceProof?.cryptographicAttestation, false);

  assert.equal(independentProposal.votes.size, 4);
  assert.equal(independentProposal.status, 'approved');
  assert.equal(independentProposal.independenceProof?.distinctExecutionContexts, 4);
  assert.equal(independentProposal.independenceProof?.identityConfidence, 1);
  assert.equal(independent.snapshot()[0].independenceProof?.status, 'claimed_distinct');
});

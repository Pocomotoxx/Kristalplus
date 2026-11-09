import type { ConsensusProposal, ConsensusVote, IndependenceProof } from '../types.js';
import { MessageBus } from '../message-bus.js';
import { canStillReach, QuorumStrategy, requiredApprovals } from './strategies.js';

export interface ProposalOptions<T = unknown> {
  taskId: string;
  proposerId: string;
  topic: string;
  data: T;
  quorum?: number; // Minimum number of approving votes
  /** Derive the quorum from the number of eligible voters. Needs `voters`; excludes `quorum`. */
  strategy?: QuorumStrategy;
  voters?: number;
  timeoutMs?: number;
}

export type SerializedProposal = Omit<ConsensusProposal<any>, 'votes'> & { votes: ConsensusVote[] };

function buildIndependenceProof(votes: readonly ConsensusVote[], voterCount: number): IndependenceProof {
  const contexts = new Set(votes.map((vote) => vote.executionContextId?.trim()).filter((id): id is string => Boolean(id)));
  const unverifiedVotes = votes.filter((vote) => !vote.executionContextId?.trim()).length;
  const distinctExecutionContexts = contexts.size + (unverifiedVotes > 0 ? 1 : 0);
  const identityConfidence = votes.length === 0 ? 0 : distinctExecutionContexts / votes.length;
  return {
    voterCount, votesReceived: votes.length, distinctExecutionContexts, unverifiedVotes,
    identityConfidence: Math.round(identityConfidence * 100) / 100,
    status: votes.length === 0 ? 'unverified' : identityConfidence === 1 && unverifiedVotes === 0 ? 'claimed_distinct' : 'insufficient',
    evidence: 'host-reported-execution-context', cryptographicAttestation: false,
  };
}

function independentApprovalCount(votes: readonly ConsensusVote[]): number {
  const contexts = new Map<string, ConsensusVote[]>();
  for (const vote of votes) {
    const key = vote.executionContextId?.trim() || '__unverified_execution_context__';
    const group = contexts.get(key) ?? [];
    group.push(vote);
    contexts.set(key, group);
  }
  return [...contexts.values()].filter((group) => group.every((vote) => vote.approve)).length;
}

/**
 * Model-agnostic quorum engine with host-reported execution-context evidence
 */
export class ConsensusEngine {
  private proposals = new Map<string, ConsensusProposal<any>>();
  private messageBus: MessageBus;

  constructor(messageBus: MessageBus) {
    this.messageBus = messageBus;
  }

  /**
   * Submit a new proposal for colony voting
   */
  public async submitProposal<T = unknown>(options: ProposalOptions<T>): Promise<ConsensusProposal<T>> {
    const id = `prop_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const timeoutMs = options.timeoutMs || 30000;

    if (options.strategy !== undefined) {
      if (options.quorum !== undefined) throw new Error('pass either a quorum or a strategy, not both');
      if (options.voters === undefined) throw new Error('a strategy needs the number of eligible voters');
    }
    const quorum = options.strategy ? requiredApprovals(options.strategy, options.voters!) : options.quorum || 2;

    const proposal: ConsensusProposal<T> = {
      id,
      taskId: options.taskId,
      proposerId: options.proposerId,
      topic: options.topic,
      data: options.data,
      votes: new Map<string, ConsensusVote>(),
      status: 'open',
      quorum,
      ...(options.strategy ? { strategy: options.strategy, voters: options.voters } : {}),
      independenceProof: buildIndependenceProof([], options.voters ?? 0),
      createdAt: Date.now(),
      expiresAt: Date.now() + timeoutMs,
    };

    this.proposals.set(id, proposal);

    await this.messageBus.publish('consensus:proposal_created', options.proposerId, {
      proposalId: id,
      taskId: options.taskId,
      topic: options.topic,
      quorum: proposal.quorum,
      expiresAt: proposal.expiresAt,
    });

    return proposal;
  }

  /**
   * Cast a vote for an active proposal
   */
  public async castVote(
    proposalId: string,
    vote: { voterId: string; approve: boolean; confidence?: number; reason?: string; executionContextId?: string }
  ): Promise<ConsensusProposal<any>> {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) {
      throw new Error(`Proposal '${proposalId}' not found`);
    }

    if (proposal.status !== 'open') {
      throw new Error(`Proposal '${proposalId}' is already finalized (${proposal.status})`);
    }

    if (Date.now() > proposal.expiresAt) {
      proposal.status = 'timeout';
      await this.messageBus.publish('consensus:proposal_timeout', 'consensus_engine', { proposalId });
      return proposal;
    }

    if (vote.executionContextId !== undefined && (!vote.executionContextId.trim() || vote.executionContextId.trim().length > 200)) {
      throw new Error('executionContextId must contain 1–200 non-whitespace characters');
    }
    const confidence = vote.confidence ?? 1;
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error('confidence must be a finite number between 0 and 1');

    if (proposal.voters !== undefined && !proposal.votes.has(vote.voterId) && proposal.votes.size >= proposal.voters) {
      throw new Error(`Proposal '${proposalId}' already has votes from all ${proposal.voters} eligible voters`);
    }

    proposal.votes.set(vote.voterId, {
      voterId: vote.voterId,
      approve: vote.approve,
      confidence,
      ...(vote.executionContextId ? { executionContextId: vote.executionContextId.trim() } : {}),
      reason: vote.reason,
      timestamp: Date.now(),
    });

    proposal.independenceProof = buildIndependenceProof(Array.from(proposal.votes.values()), proposal.voters ?? proposal.votes.size);

    await this.messageBus.publish('consensus:vote_cast', vote.voterId, {
      proposalId,
      approve: vote.approve,
      confidence,
      ...(vote.executionContextId ? { executionContextId: vote.executionContextId.trim() } : {}),
    });

    this.evaluateProposal(proposal);
    return proposal;
  }

  private evaluateProposal(proposal: ConsensusProposal<any>): void {
    const votes = Array.from(proposal.votes.values());
    const approvals = votes.filter((v) => v.approve);
    const rejections = votes.filter((v) => !v.approve);

    // Confidence is advisory metadata; Byzantine approval counts distinct reported execution contexts.
    const approvalCount = proposal.strategy === 'byzantine' ? independentApprovalCount(votes) : approvals.length;

    if (approvalCount >= proposal.quorum) {
      proposal.status = 'approved';
      this.messageBus.publish('consensus:proposal_approved', 'consensus_engine', {
        proposalId: proposal.id,
        taskId: proposal.taskId,
        approvals: approvalCount,
      });
    } else if (
      proposal.voters !== undefined
        ? proposal.strategy === 'byzantine'
          ? proposal.votes.size >= proposal.voters && approvalCount < proposal.quorum
          : !canStillReach(approvals.length, rejections.length, proposal.voters, proposal.quorum)
        : rejections.length > votes.length / 2 && votes.length >= proposal.quorum
    ) {
      proposal.status = 'rejected';
      this.messageBus.publish('consensus:proposal_rejected', 'consensus_engine', {
        proposalId: proposal.id,
        taskId: proposal.taskId,
        rejections: rejections.length,
        independenceProof: buildIndependenceProof(votes, proposal.voters ?? votes.length),
      });
    }
  }

  public getProposal(proposalId: string): ConsensusProposal<any> | undefined {
    const proposal = this.proposals.get(proposalId);
    return proposal ? { ...proposal, independenceProof: buildIndependenceProof(Array.from(proposal.votes.values()), proposal.voters ?? proposal.votes.size) } : undefined;
  }

  public listProposals(): ConsensusProposal<any>[] {
    return Array.from(this.proposals.values(), (proposal) => ({ ...proposal, independenceProof: buildIndependenceProof(Array.from(proposal.votes.values()), proposal.voters ?? proposal.votes.size) }));
  }

  public snapshot(): SerializedProposal[] {
    return this.listProposals().map(({ votes, ...rest }) => ({
      ...structuredClone(rest),
      votes: Array.from(votes.values()).map((v) => ({ ...v })),
      independenceProof: buildIndependenceProof(Array.from(votes.values()), rest.voters ?? votes.size),
    }));
  }

  public restore(proposals: SerializedProposal[]): void {
    this.proposals.clear();
    for (const { votes, ...rest } of proposals) {
      const voteMap = new Map<string, ConsensusVote>();
      for (const v of votes) voteMap.set(v.voterId, { ...v });
      this.proposals.set(rest.id, { ...structuredClone(rest), independenceProof: buildIndependenceProof(Array.from(voteMap.values()), rest.voters ?? voteMap.size), votes: voteMap });
    }
  }
}

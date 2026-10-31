import { ConsensusProposal, ConsensusVote } from '../types.js';
import { MessageBus } from '../message-bus.js';

export interface ProposalOptions<T = unknown> {
  taskId: string;
  proposerId: string;
  topic: string;
  data: T;
  quorum?: number; // Minimum number of approving votes
  timeoutMs?: number;
}

/**
 * Robust, model-agnostic consensus engine supporting quorum and confidence-weighted voting
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

    const proposal: ConsensusProposal<T> = {
      id,
      taskId: options.taskId,
      proposerId: options.proposerId,
      topic: options.topic,
      data: options.data,
      votes: new Map<string, ConsensusVote>(),
      status: 'open',
      quorum: options.quorum || 2,
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
    vote: { voterId: string; approve: boolean; confidence?: number; reason?: string }
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

    proposal.votes.set(vote.voterId, {
      voterId: vote.voterId,
      approve: vote.approve,
      confidence: vote.confidence ?? 1.0,
      reason: vote.reason,
      timestamp: Date.now(),
    });

    await this.messageBus.publish('consensus:vote_cast', vote.voterId, {
      proposalId,
      approve: vote.approve,
      confidence: vote.confidence ?? 1.0,
    });

    this.evaluateProposal(proposal);
    return proposal;
  }

  private evaluateProposal(proposal: ConsensusProposal<any>): void {
    const votes = Array.from(proposal.votes.values());
    const approvals = votes.filter((v) => v.approve);
    const rejections = votes.filter((v) => !v.approve);

    // Calculate confidence-weighted approval
    const totalWeightedApproval = approvals.reduce((sum, v) => sum + v.confidence, 0);

    if (approvals.length >= proposal.quorum) {
      proposal.status = 'approved';
      this.messageBus.publish('consensus:proposal_approved', 'consensus_engine', {
        proposalId: proposal.id,
        taskId: proposal.taskId,
        approvals: approvals.length,
        weightedApproval: totalWeightedApproval,
      });
    } else if (rejections.length > votes.length / 2 && votes.length >= proposal.quorum) {
      proposal.status = 'rejected';
      this.messageBus.publish('consensus:proposal_rejected', 'consensus_engine', {
        proposalId: proposal.id,
        taskId: proposal.taskId,
        rejections: rejections.length,
      });
    }
  }

  public getProposal(proposalId: string): ConsensusProposal<any> | undefined {
    return this.proposals.get(proposalId);
  }
}

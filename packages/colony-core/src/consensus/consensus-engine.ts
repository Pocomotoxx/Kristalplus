import type { AgentRole, ConsensusProposal, ConsensusVote, DebateMode, DiscussionEntryKind, IndependenceProof, ProposalDiscussionEntry } from '../types.js';
import type { MessageBus } from '../message-bus.js';
import { canStillReach, requiredApprovals } from './strategies.js';
import type { QuorumStrategy } from './strategies.js';
import { canUseDebateMode, DEBATE_MODES_BY_ROLE } from '../debate/debate-modes.js';

export interface ProposalOptions<T = unknown> {
  taskId: string;
  proposerId: string;
  topic: string;
  data: T;
  quorum?: number; // Minimum number of approving votes
  /** Derive the quorum from the number of eligible voters. Needs `voters`; excludes `quorum`. */
  strategy?: QuorumStrategy;
  /** Exact, frozen electorate. Required for every new proposal and every voting strategy. */
  eligibleVoterIds: readonly string[];
  eligibleVoterRoles: Record<string, AgentRole>;
  eligibleVoterProfileIds: Record<string, string | null>;
  /** Optional cross-check for callers migrating from count-based proposal creation. */
  voters?: number;
  voterWeights?: Record<string, number>;
  timeoutMs?: number;
}

export type SerializedProposal = Omit<ConsensusProposal<any>, 'votes'> & { votes: ConsensusVote[] };

function buildIndependenceProof(votes: readonly ConsensusVote[], voterCount: number): IndependenceProof {
  const contexts = new Set(votes.map((vote) => vote.executionContextId?.trim()).filter((id): id is string => Boolean(id)));
  const unverifiedVotes = votes.filter((vote) => !vote.executionContextId?.trim()).length;
  const distinctExecutionContexts = contexts.size + (unverifiedVotes > 0 ? 1 : 0);
  const identityConfidence = votes.length === 0 ? 0 : distinctExecutionContexts / votes.length;
  return {
    voterCount,
    votesReceived: votes.length,
    distinctExecutionContexts,
    unverifiedVotes,
    identityConfidence: Math.round(identityConfidence * 100) / 100,
    status: votes.length === 0 ? 'unverified' : identityConfidence === 1 && unverifiedVotes === 0 ? 'claimed_distinct' : 'insufficient',
    evidence: 'host-reported-execution-context',
    cryptographicAttestation: false,
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
  // A claimed execution context contributes at most one approval. Conflicting votes fail closed.
  return [...contexts.values()].filter((group) => group.every((vote) => vote.approve)).length;
}

/**
 * Model-agnostic consensus engine for quorum rules and explicitly weighted strategies
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
    const timeoutMs = options.timeoutMs ?? 30000;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || !Number.isFinite(Date.now() + timeoutMs) || Date.now() + timeoutMs > 8.64e15) {
      throw new Error('timeoutMs must be a positive finite duration within the supported date range');
    }

    if (options.strategy !== undefined && options.quorum !== undefined) throw new Error('pass either a quorum or a strategy, not both');
    const eligibleVoterIds = [...new Set(options.eligibleVoterIds)];
    if (eligibleVoterIds.length < 2 || eligibleVoterIds.length !== options.eligibleVoterIds.length
      || eligibleVoterIds.some((memberId) => !memberId.trim())) {
      throw new Error('a proposal needs at least two unique eligible voter IDs');
    }
    const voters = eligibleVoterIds.length;
    const rosterMatches = (value: Record<string, unknown> | undefined) =>
      Boolean(value) && Object.keys(value!).length === voters && eligibleVoterIds.every((memberId) => Object.prototype.hasOwnProperty.call(value!, memberId));
    if (!rosterMatches(options.eligibleVoterRoles) || !rosterMatches(options.eligibleVoterProfileIds)) {
      throw new Error('frozen voter roles and profile IDs must match the electorate');
    }
    if (eligibleVoterIds.some((memberId) => options.eligibleVoterRoles[memberId] === 'mother')) {
      throw new Error('Mother is an advisor and cannot be included in the voting electorate');
    }
    const knownRoles = new Set(Object.keys(DEBATE_MODES_BY_ROLE));
    if (eligibleVoterIds.some((memberId) => !knownRoles.has(options.eligibleVoterRoles[memberId]))) {
      throw new Error('frozen electorate contains an unknown agent role');
    }
    if (Object.values(options.eligibleVoterProfileIds).some((profileId) => profileId !== null && typeof profileId !== 'string')) {
      throw new Error('frozen profile IDs must be strings or null');
    }
    if (options.voters !== undefined && options.voters !== voters) throw new Error('voter count must match the frozen electorate');
    if (options.strategy === 'weighted') {
      if (!options.voterWeights || Object.keys(options.voterWeights).length !== voters
        || eligibleVoterIds.some((id) => options.voterWeights![id] === undefined)) {
        throw new Error('weighted strategy needs one weight per eligible voter');
      }
      if (Object.values(options.voterWeights).some((weight) => !Number.isFinite(weight) || weight <= 0)) throw new Error('voter weights must be positive finite numbers');
    }
    const halfWeight = options.strategy === 'weighted'
      ? Object.values(options.voterWeights!).reduce((sum, weight) => sum + weight, 0) / 2
      : 0;
    const quorum = options.strategy === 'weighted'
      ? halfWeight + Number.EPSILON * Math.max(1, Math.abs(halfWeight))
      : options.strategy ? requiredApprovals(options.strategy, voters) : options.quorum || 2;
    if (options.strategy !== 'weighted' && quorum > voters) {
      throw new Error('quorum cannot exceed the frozen electorate size');
    }

    const proposal: ConsensusProposal<T> = {
      id,
      taskId: options.taskId,
      proposerId: options.proposerId,
      topic: options.topic,
      data: options.data,
      votes: new Map<string, ConsensusVote>(),
      status: 'open',
      quorum,
      ...(options.strategy ? { strategy: options.strategy } : {}),
      voters,
      eligibleVoterIds: Object.freeze(eligibleVoterIds),
      eligibleVoterRoles: Object.freeze({ ...options.eligibleVoterRoles }),
      eligibleVoterProfileIds: Object.freeze({ ...options.eligibleVoterProfileIds }),
      phase: 'discussion',
      discussion: [],
      ...(options.strategy === 'weighted' ? { voterWeights: Object.freeze({ ...options.voterWeights }) } : {}),
      createdAt: Date.now(),
      expiresAt: Date.now() + timeoutMs,
      independenceProof: buildIndependenceProof([], voters),
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

  /** Add an auditable position or a direct response to an earlier position. */
  public addDiscussionEntry(
    proposalId: string,
    entry: { authorId: string; kind: DiscussionEntryKind; mode: DebateMode; text: string; replyTo?: string },
  ): ProposalDiscussionEntry {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) throw new Error(`Proposal '${proposalId}' not found`);
    if (proposal.status !== 'open' || (proposal.phase ?? 'voting') !== 'discussion') {
      throw new Error(`Proposal '${proposalId}' is not in discussion`);
    }
    if (proposal.eligibleVoterIds && !proposal.eligibleVoterIds.includes(entry.authorId)) {
      throw new Error(`Member '${entry.authorId}' is not in the frozen electorate`);
    }
    if (entry.kind !== 'position' && entry.kind !== 'reply') throw new Error('discussion entry kind must be position or reply');
    const role = proposal.eligibleVoterRoles?.[entry.authorId];
    const profileId = proposal.eligibleVoterProfileIds?.[entry.authorId] ?? null;
    if (!role || !canUseDebateMode(role, profileId, entry.mode)) {
      throw new Error(`Debate mode '${entry.mode}' is not available to member '${entry.authorId}'`);
    }
    const text = entry.text.trim();
    if (!text || text.length > 4000) throw new Error('discussion text must be 1–4000 characters');
    if (proposal.discussion!.length >= 60) throw new Error('discussion is limited to 60 entries');
    if (entry.kind === 'reply') {
      if (!entry.replyTo) throw new Error('a reply must name the position it responds to');
      const target = proposal.discussion!.find((item) => item.id === entry.replyTo);
      if (!target || target.kind !== 'position') throw new Error('replies must target an existing position');
      if (target.authorId === entry.authorId) throw new Error('a member cannot reply to their own position');
      if (proposal.discussion!.some((item) => item.kind === 'reply' && item.authorId === entry.authorId && item.replyTo === entry.replyTo)) {
        throw new Error('a member can reply to each position only once');
      }
    } else if (entry.replyTo !== undefined) {
      throw new Error('a position cannot have a reply target');
    } else if (proposal.discussion!.some((item) => item.kind === 'position' && item.authorId === entry.authorId)) {
      throw new Error('a member can add only one position');
    }
    const record: ProposalDiscussionEntry = {
      id: `entry_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      kind: entry.kind,
      mode: entry.mode,
      authorId: entry.authorId,
      ...(entry.replyTo ? { replyTo: entry.replyTo } : {}),
      text,
      createdAt: Date.now(),
    };
    proposal.discussion!.push(record);
    return record;
  }

  /** Freeze the discussion into the final text that the electorate will vote on. */
  public finalizeDiscussion(proposalId: string, authorId: string, finalProposal: string): ConsensusProposal<any> {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) throw new Error(`Proposal '${proposalId}' not found`);
    if (proposal.status !== 'open' || (proposal.phase ?? 'voting') !== 'discussion') {
      throw new Error(`Proposal '${proposalId}' is not in discussion`);
    }
    if (proposal.proposerId !== authorId) throw new Error('only the proposer can finalize the discussion');
    if (!proposal.discussion?.some((entry) => entry.kind === 'position')) {
      throw new Error('at least one position is required before finalization');
    }
    if (!proposal.discussion.some((entry) => entry.kind === 'reply')) {
      throw new Error('at least one reply is required before finalization');
    }
    const text = finalProposal.trim();
    if (!text || text.length > 4000) throw new Error('final proposal must be 1–4000 characters');
    proposal.finalProposal = text;
    proposal.phase = 'voting';
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
    if ((proposal.phase ?? 'voting') !== 'voting') {
      throw new Error(`Proposal '${proposalId}' discussion is not finalized`);
    }
    if (proposal.eligibleVoterIds && !proposal.eligibleVoterIds.includes(vote.voterId)) {
      throw new Error(`Member '${vote.voterId}' is not an eligible voter in the frozen electorate for proposal '${proposalId}'`);
    }

    if (vote.executionContextId !== undefined && (!vote.executionContextId.trim() || vote.executionContextId.trim().length > 200)) {
      throw new Error('executionContextId must contain 1–200 non-whitespace characters');
    }

    const confidence = vote.confidence ?? 1.0;
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      throw new Error('confidence must be a finite number between 0 and 1');
    }

    if (proposal.voters !== undefined && !proposal.votes.has(vote.voterId) && proposal.votes.size >= proposal.voters) {
      throw new Error(`Proposal '${proposalId}' already has votes from all ${proposal.voters} eligible voters`);
    }

    if (proposal.strategy === 'weighted' && (!proposal.voterWeights || proposal.voterWeights[vote.voterId] === undefined)) {
      throw new Error(`Member '${vote.voterId}' is not an eligible voter on weighted proposal '${proposalId}'`);
    }

    proposal.votes.set(vote.voterId, {
      voterId: vote.voterId,
      approve: vote.approve,
      confidence,
      ...(vote.executionContextId ? { executionContextId: vote.executionContextId.trim() } : {}),
      ...(proposal.strategy === 'weighted' ? { weight: proposal.voterWeights![vote.voterId] } : {}),
      reason: vote.reason,
      timestamp: Date.now(),
    });

    proposal.independenceProof = buildIndependenceProof(Array.from(proposal.votes.values()), proposal.voters ?? proposal.eligibleVoterIds?.length ?? proposal.votes.size);

    await this.messageBus.publish('consensus:vote_cast', vote.voterId, {
      proposalId,
      approve: vote.approve,
      confidence: vote.confidence ?? 1.0,
      ...(vote.executionContextId ? { executionContextId: vote.executionContextId.trim() } : {}),
      ...(proposal.strategy === 'weighted' ? { weight: proposal.voterWeights![vote.voterId] } : {}),
    });

    this.evaluateProposal(proposal);
    return proposal;
  }

  private evaluateProposal(proposal: ConsensusProposal<any>): void {
    const votes = Array.from(proposal.votes.values());
    const approvals = votes.filter((v) => v.approve);
    const rejections = votes.filter((v) => !v.approve);

    // Confidence is recorded as advisory metadata only; only the weighted strategy uses frozen vote weights.
    const totalWeightedApproval = approvals.reduce((sum, v) => sum + (v.weight ?? 0), 0);
    const approvalCount = proposal.strategy === 'weighted' ? totalWeightedApproval
      : proposal.strategy === 'byzantine' ? independentApprovalCount(votes) : approvals.length;

    if (approvalCount >= proposal.quorum) {
      proposal.status = 'approved';
      this.messageBus.publish('consensus:proposal_approved', 'consensus_engine', {
        proposalId: proposal.id,
        taskId: proposal.taskId,
        approvals: approvalCount,
        ...(proposal.strategy === 'weighted' ? { weightedApproval: totalWeightedApproval } : {}),
      });
    } else if (
      proposal.voters !== undefined
        ? proposal.strategy === 'weighted'
          ? totalWeightedApproval + Object.entries(proposal.voterWeights ?? {}).filter(([id]) => !proposal.votes.has(id)).reduce((sum, [, weight]) => sum + weight, 0) < proposal.quorum
          : proposal.strategy === 'byzantine'
            ? proposal.votes.size >= proposal.voters && approvalCount < proposal.quorum
            : !canStillReach(approvals.length, rejections.length, proposal.voters, proposal.quorum)
        : rejections.length > votes.length / 2 && votes.length >= proposal.quorum
    ) {
      proposal.status = 'rejected';
      this.messageBus.publish('consensus:proposal_rejected', 'consensus_engine', {
        proposalId: proposal.id,
        taskId: proposal.taskId,
        rejections: rejections.length,
      });
    }
  }

  public getProposal(proposalId: string): ConsensusProposal<any> | undefined {
    const proposal = this.proposals.get(proposalId);
    return proposal ? { ...proposal, independenceProof: buildIndependenceProof(Array.from(proposal.votes.values()), proposal.voters ?? proposal.eligibleVoterIds?.length ?? proposal.votes.size) } : undefined;
  }

  public listProposals(): ConsensusProposal<any>[] {
    return Array.from(this.proposals.values(), (proposal) => ({ ...proposal, independenceProof: buildIndependenceProof(Array.from(proposal.votes.values()), proposal.voters ?? proposal.eligibleVoterIds?.length ?? proposal.votes.size) }));
  }

  public snapshot(): SerializedProposal[] {
    return this.listProposals().map(({ votes, ...rest }) => ({
      ...structuredClone(rest),
      votes: Array.from(votes.values()).map((v) => ({ ...v })),
      independenceProof: buildIndependenceProof(Array.from(votes.values()), rest.voters ?? rest.eligibleVoterIds?.length ?? votes.size),
    }));
  }

  public restore(proposals: SerializedProposal[]): void {
    this.proposals.clear();
    for (const { votes, ...rest } of proposals) {
      const voteMap = new Map<string, ConsensusVote>();
      for (const v of votes) voteMap.set(v.voterId, { ...v });
      this.proposals.set(rest.id, {
        ...structuredClone(rest),
        phase: rest.phase ?? 'voting',
        eligibleVoterIds: rest.eligibleVoterIds ? Object.freeze([...rest.eligibleVoterIds]) : undefined,
        eligibleVoterRoles: rest.eligibleVoterRoles ? Object.freeze({ ...rest.eligibleVoterRoles }) : undefined,
        eligibleVoterProfileIds: rest.eligibleVoterProfileIds ? Object.freeze({ ...rest.eligibleVoterProfileIds }) : undefined,
        voterWeights: rest.voterWeights ? Object.freeze({ ...rest.voterWeights }) : undefined,
        discussion: rest.discussion ?? [],
        independenceProof: buildIndependenceProof(Array.from(voteMap.values()), rest.voters ?? rest.eligibleVoterIds?.length ?? voteMap.size),
        votes: voteMap,
      });
    }
  }
}

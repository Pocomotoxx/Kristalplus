/**
 * Colony Core Type Definitions
 * Modern ESM, model-agnostic agent orchestration system
 */

export type AgentRole =
  | 'director'
  | 'architect'
  | 'engineer'
  | 'reviewer'
  | 'tester'
  | 'analyst'
  | 'security'
  | 'auditor'
  | 'researcher'
  | 'writer'
  | 'exobiologist'
  | 'custom';

/**
 * Roles that only receive a task when it asks for them by name. Left in the open pool, the
 * auditor would lose its independence by doing ordinary work, and the exobiologist would be handed
 * routine tasks it is not meant for. Neither counts as an implicit candidate in dispatch.
 */
export const ADVISORY_ROLES: readonly AgentRole[] = ['auditor', 'exobiologist'];

export type ColonySpecialization = 'release-operations' | `domain:${string}`;
export type DebateMode = 'rational' | 'fact-finding' | 'courtroom' | 'negotiation' | 'quarrel';
export interface DebateModePair {
  default: DebateMode;
  alternate: DebateMode;
}

export type AgentStatus = 'idle' | 'busy' | 'voting' | 'offline' | 'error';

export interface ColonyAgentCapabilities {
  tools: string[];
  maxConcurrentTasks: number;
  languages?: string[];
  specializations?: ColonySpecialization[];
  contextWindowLimit?: number;
}

export interface ColonyMember {
  id: string;
  name: string;
  role: AgentRole;
  status: AgentStatus;
  capabilities: ColonyAgentCapabilities;
  currentTaskIds: string[];
  metadata?: Record<string, unknown>;
  createdAt: number;
  lastActiveAt: number;
}

export type TaskPriority = 'low' | 'normal' | 'high' | 'critical';

export type TaskStatus =
  | 'pending'
  | 'assigned'
  | 'in_progress'
  | 'review'
  | 'consensus'
  | 'completed'
  | 'failed'
  | 'cancelled';

/** One verdict of a reviewer on a task. The reason is stored redacted and shortened. */
export interface ReviewRecord {
  by: string;
  verdict: 'approve' | 'reject';
  reason: string;
  at: number;
}

export interface ColonyTask {
  id: string;
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  requiredRole?: AgentRole;
  requiredCapabilities?: string[];
  assignedAgentId?: string;
  assignedAgentIds?: string[]; // Multiple agents for collaborative or consensus tasks
  parentId?: string;
  subTaskIds?: string[];
  dependencies?: string[]; // IDs of tasks that must be completed first
  inputData?: Record<string, unknown>;
  outputResult?: unknown;
  error?: string;
  /**
   * A hold put on the task by the auditor: it cannot be completed or dispatched until released.
   * The release note is what the host says the user decided; the colony cannot check that a person did.
   */
  hold?: { by: string; reason: string; at: number };
  /** The task cannot be completed until a reviewer approves it. A rejection blocks completion either way. */
  reviewRequired?: boolean;
  /** Rejections after which the task is put on hold for the user. Default 3. */
  maxReviewRounds?: number;
  /** Rejections so far (reset when the user releases a hold the review limit put on). */
  reviewRounds?: number;
  /** The most recent verdicts, oldest first (at most 20). */
  reviews?: ReviewRecord[];
  /** Quality 0..1 as REPORTED by the host when it closed the task. Not measured by the colony. */
  quality?: number;
  /** The host says a test run backed this outcome. The colony cannot check that; it only keeps the label apart. */
  verifiedByTest?: boolean;
  consensusRequired?: boolean;
  minConsensusQuorum?: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

export interface ColonyEvent<T = unknown> {
  id: string;
  topic: string;
  senderId: string;
  timestamp: number;
  payload: T;
}

export type ProposalPhase = 'discussion' | 'voting';
export type DiscussionEntryKind = 'position' | 'reply';
export interface ProposalDiscussionEntry {
  id: string;
  kind: DiscussionEntryKind;
  mode: DebateMode;
  authorId: string;
  replyTo?: string;
  text: string;
  createdAt: number;
}

export interface ConsensusProposal<T = unknown> {
  id: string;
  taskId: string;
  proposerId: string;
  topic: string;
  data: T;
  votes: Map<string, ConsensusVote>;
  status: 'open' | 'approved' | 'rejected' | 'timeout';
  quorum: number;
  /** Number of eligible voters captured when the proposal was created. */
  voters?: number;
  strategy?: string;
  /** New proposals freeze this electorate at creation; absent only on pre-migration ledger records. */
  eligibleVoterIds?: readonly string[];
  /** Voter identities are frozen with the electorate so only the designated profile can use quarrel mode. */
  eligibleVoterRoles?: Readonly<Record<string, AgentRole>>;
  eligibleVoterProfileIds?: Readonly<Record<string, string | null>>;
  /** New proposals begin in discussion; legacy open proposals restore directly to voting. */
  phase?: ProposalPhase;
  discussion?: ProposalDiscussionEntry[];
  finalProposal?: string;
  /** Fixed weights captured at proposal creation, so later history cannot change its result. */
  voterWeights?: Readonly<Record<string, number>>;
  createdAt: number;
  expiresAt: number;
}

export interface ConsensusVote {
  voterId: string;
  approve: boolean;
  confidence: number; // 0.0 - 1.0
  /** Colony-derived contribution for weighted proposals; other strategies use one vote per member. */
  weight?: number;
  reason?: string;
  timestamp: number;
}

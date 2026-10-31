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
  | 'custom';

export type AgentStatus = 'idle' | 'busy' | 'voting' | 'offline' | 'error';

export interface ColonyAgentCapabilities {
  tools: string[];
  maxConcurrentTasks: number;
  languages?: string[];
  specializations?: string[];
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

export interface ConsensusProposal<T = unknown> {
  id: string;
  taskId: string;
  proposerId: string;
  topic: string;
  data: T;
  votes: Map<string, ConsensusVote>;
  status: 'open' | 'approved' | 'rejected' | 'timeout';
  quorum: number;
  /** Set when the quorum was derived from a strategy: the number of eligible voters. */
  voters?: number;
  strategy?: string;
  createdAt: number;
  expiresAt: number;
}

export interface ConsensusVote {
  voterId: string;
  approve: boolean;
  confidence: number; // 0.0 - 1.0
  reason?: string;
  timestamp: number;
}

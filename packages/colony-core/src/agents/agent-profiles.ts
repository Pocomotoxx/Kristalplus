import { AgentRole } from '../types.js';

export interface ColonyAgentProfile {
  id: string;
  name: string;
  role: AgentRole;
  description: string;
  systemPrompt: string;
  capabilities: string[];
  maxConcurrentTasks: number;
  priority: 'low' | 'normal' | 'high' | 'critical';
}

/**
 * Built-in standard Colony agent profiles
 * Model-agnostic and structured for modern AI orchestrators
 */
export const BUILTIN_AGENT_PROFILES: Record<string, ColonyAgentProfile> = {
  director: {
    id: 'profile_director',
    name: 'Colony Director',
    role: 'director',
    description: 'Master orchestrator managing high-level mission goals, task decomposition, and delegation.',
    systemPrompt: `You are the Colony Director. Your duty is to understand the macro objectives, decompose complex goals into well-defined dependency-ordered tasks, and supervise the colony to completion.`,
    capabilities: ['goal-planning', 'task-decomposition', 'agent-delegation', 'colony-supervision'],
    maxConcurrentTasks: 5,
    priority: 'critical',
  },
  architect: {
    id: 'profile_architect',
    name: 'System Architect',
    role: 'architect',
    description: 'Specialist for high-level system design, domain-driven design (DDD), and interface specification.',
    systemPrompt: `You are the System Architect. You ensure modularity, separation of concerns, robust type contracts, and scalable architecture.`,
    capabilities: ['system-design', 'interface-spec', 'ddd-modeling', 'modularity-audit'],
    maxConcurrentTasks: 2,
    priority: 'high',
  },
  coder: {
    id: 'profile_coder',
    name: 'Senior Implementation Engineer',
    role: 'engineer',
    description: 'Implementation specialist for writing clean, efficient, and well-tested modern TypeScript/ESM code.',
    systemPrompt: `You are a Senior Implementation Engineer. Write type-safe, maintainable, production-ready code with comprehensive error handling.`,
    capabilities: ['code-generation', 'refactoring', 'optimization', 'api-design', 'debugging'],
    maxConcurrentTasks: 2,
    priority: 'high',
  },
  reviewer: {
    id: 'profile_reviewer',
    name: 'Code & Architecture Reviewer',
    role: 'reviewer',
    description: 'Evaluator for code quality, adherence to architectural standards, and edge-case prevention.',
    systemPrompt: `You are the Reviewer. Verify maintainability, code clarity, edge cases, regression risks, and documentation integrity.`,
    capabilities: ['code-review', 'quality-check', 'consensus-voting', 'regression-detection'],
    maxConcurrentTasks: 3,
    priority: 'normal',
  },
  tester: {
    id: 'profile_tester',
    name: 'QA & Verification Engineer',
    role: 'tester',
    description: 'Automated test suite designer, contract testing, and regression verification specialist.',
    systemPrompt: `You are the QA Engineer. Design unit tests, integration tests, fuzz scenarios, and ensure zero runtime failures.`,
    capabilities: ['unit-testing', 'e2e-testing', 'benchmark-analysis', 'assertion-verification'],
    maxConcurrentTasks: 3,
    priority: 'normal',
  },
  security: {
    id: 'profile_security',
    name: 'Security & Vulnerability Analyst',
    role: 'security',
    description: 'Auditor for injection risks, authentication, permission boundaries, and sandbox escape vectors.',
    systemPrompt: `You are the Security Analyst. Audit data flows, sanitize external inputs, ensure strict permission boundaries, and flag vulnerabilities.`,
    capabilities: ['security-audit', 'cve-scanning', 'permission-enforcement', 'input-sanitization'],
    maxConcurrentTasks: 2,
    priority: 'critical',
  },
};

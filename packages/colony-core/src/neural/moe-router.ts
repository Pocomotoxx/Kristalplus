import { AgentRole } from '../types.js';

export interface RouteDecision {
  targetRole: AgentRole;
  confidence: number;
  reasoning: string;
  matchedKeywords: string[];
}

export interface RoutingRule {
  role: AgentRole;
  keywords: string[];
  patterns: RegExp[];
  baseWeight: number;
}

/**
 * Mixture of Experts (MoE) Task Router
 * Dynamically classifies input tasks and selects the best specialist agent
 */
export class MoERouter {
  private rules: RoutingRule[] = [
    {
      role: 'security',
      keywords: ['vulnerability', 'cve', 'security', 'auth', 'sanitize', 'injection', 'permission', 'token', 'exploit'],
      patterns: [/secur(e|ity)/i, /vulnerab/i, /cve-\d+/i, /auth(enticat|oriz)/i],
      baseWeight: 1.2, // Higher sensitivity for security topics
    },
    {
      role: 'architect',
      keywords: ['architecture', 'design', 'spec', 'ddd', 'pattern', 'structure', 'boundary', 'modular', 'system'],
      patterns: [/architect/i, /system design/i, /spec(ification)?/i, /interfac(e|es)/i],
      baseWeight: 1.0,
    },
    {
      role: 'tester',
      keywords: ['test', 'qa', 'e2e', 'unit test', 'coverage', 'benchmark', 'assert', 'mock', 'fuzz'],
      patterns: [/test(ing|s)?/i, /qa/i, /benchmark/i, /assert/i],
      baseWeight: 1.0,
    },
    {
      role: 'reviewer',
      keywords: ['review', 'audit', 'evaluate', 'inspect', 'lint', 'pr', 'code review', 'check'],
      patterns: [/review/i, /audit/i, /inspect/i, /code review/i],
      baseWeight: 1.0,
    },
    {
      role: 'engineer',
      keywords: ['implement', 'code', 'build', 'create', 'refactor', 'fix', 'bug', 'typescript', 'esm', 'function', 'class'],
      patterns: [/implement/i, /code/i, /build/i, /refactor/i, /develop/i],
      baseWeight: 1.0,
    },
    {
      role: 'director',
      keywords: ['plan', 'roadmap', 'milestone', 'strategy', 'goal', 'supervise', 'coordinate', 'project'],
      patterns: [/plan/i, /roadmap/i, /strategy/i, /coordinat/i],
      baseWeight: 0.9,
    },
  ];

  /**
   * Route a task to the most appropriate agent role
   */
  public routeTask(taskDescription: string): RouteDecision {
    const text = taskDescription.toLowerCase();
    let bestRole: AgentRole = 'engineer'; // Default fallback
    let bestScore = 0;
    let bestMatchedKeywords: string[] = [];
    let bestReason = 'Default fallback assignment';

    for (const rule of this.rules) {
      let score = 0;
      const matchedKeywords: string[] = [];

      for (const kw of rule.keywords) {
        if (text.includes(kw)) {
          score += 1.0;
          matchedKeywords.push(kw);
        }
      }

      for (const pat of rule.patterns) {
        if (pat.test(text)) {
          score += 1.5;
        }
      }

      score *= rule.baseWeight;

      if (score > bestScore) {
        bestScore = score;
        bestRole = rule.role;
        bestMatchedKeywords = matchedKeywords;
        bestReason = `Matched ${matchedKeywords.length} keywords (${matchedKeywords.join(', ')}) with weight ${rule.baseWeight}`;
      }
    }

    const confidence = bestScore > 0 ? Math.min(1.0, 0.4 + bestScore * 0.15) : 0.5;

    return {
      targetRole: bestRole,
      confidence,
      reasoning: bestScore > 0 ? bestReason : 'No strong keyword affinity detected, routing to general engineer',
      matchedKeywords: bestMatchedKeywords,
    };
  }
}

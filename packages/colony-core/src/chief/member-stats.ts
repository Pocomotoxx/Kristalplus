/**
 * Member statistics, derived from the ledger. Nothing is stored separately: the numbers always
 * follow from the tasks and claims, so they cannot drift from them.
 *
 * What they are worth: a completed task is what the host REPORTED as done, not a verified result.
 * "Duration" runs from the moment the task was assigned to the moment it was closed, so it includes
 * time spent waiting. Treat both as indications.
 */

import type { Claim } from '../coordination/claim-ledger.js';
import type { ColonyMember, ColonyTask } from '../types.js';

export interface MemberStats {
  memberId: string;
  completed: number;
  failed: number;
  /** Tasks the member currently holds (assigned, in progress, in review or consensus). */
  open: number;
  /**
   * Laplace-smoothed share of finished tasks that were completed: (completed + 1) / (finished + 2).
   * A member with no history gets 0.5 instead of an invented 0 or 1, and one result barely moves it.
   */
  successRate: number;
  /** Mean assigned-to-closed time of completed tasks; null when there is no such task. */
  avgDurationMs: number | null;
  /** Claims the member holds that have gone stealable. */
  staleClaims: number;
  lastActivityAt: number;
}

const OPEN_STATUSES: ReadonlySet<string> = new Set(['assigned', 'in_progress', 'review', 'consensus']);

export function computeMemberStats(
  members: readonly ColonyMember[],
  tasks: readonly ColonyTask[],
  claims: readonly Claim[]
): Map<string, MemberStats> {
  const stats = new Map<string, MemberStats>();
  const durations = new Map<string, number[]>();
  for (const m of members) {
    stats.set(m.id, { memberId: m.id, completed: 0, failed: 0, open: 0, successRate: 0.5, avgDurationMs: null, staleClaims: 0, lastActivityAt: m.lastActiveAt });
    durations.set(m.id, []);
  }

  for (const task of tasks) {
    const s = task.assignedAgentId ? stats.get(task.assignedAgentId) : undefined;
    if (!s) continue;
    if (task.status === 'completed') {
      s.completed++;
      if (task.startedAt !== undefined && task.completedAt !== undefined && task.completedAt >= task.startedAt) {
        durations.get(s.memberId)!.push(task.completedAt - task.startedAt);
      }
    } else if (task.status === 'failed') {
      s.failed++;
    } else if (OPEN_STATUSES.has(task.status)) {
      s.open++;
    }
  }

  for (const claim of claims) {
    const s = stats.get(claim.holderId);
    if (!s || claim.status === 'closed') continue;
    if (claim.status === 'stealable') s.staleClaims++;
    s.lastActivityAt = Math.max(s.lastActivityAt, claim.lastActivityAt);
  }

  for (const s of stats.values()) {
    s.successRate = (s.completed + 1) / (s.completed + s.failed + 2);
    const d = durations.get(s.memberId)!;
    s.avgDurationMs = d.length === 0 ? null : Math.round(d.reduce((a, b) => a + b, 0) / d.length);
  }
  return stats;
}

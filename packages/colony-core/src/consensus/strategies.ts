/**
 * Quorum thresholds for colony voting. Pure functions, no network, no timers, no identity attestation.
 *
 * Ported in spirit from the legacy swarm consensus (Raft majority, Byzantine 3f+1), without
 * the replication protocol: the colony has one ledger, so only the decision rules are needed.
 */

export type QuorumStrategy = 'majority' | 'supermajority' | 'byzantine' | 'unanimous' | 'weighted';

export const QUORUM_STRATEGIES: readonly QuorumStrategy[] = ['majority', 'supermajority', 'byzantine', 'unanimous', 'weighted'];

/** Number of approving votes needed among `voters` eligible voters. */
export function requiredApprovals(strategy: QuorumStrategy, voters: number): number {
  if (!Number.isInteger(voters) || voters < 1) {
    throw new Error('voters must be a positive integer');
  }
  switch (strategy) {
    case 'majority':
      return Math.floor(voters / 2) + 1;
    case 'supermajority':
      return Math.ceil((2 * voters) / 3);
    case 'byzantine': {
      // Classical 3f+1 threshold. Its fault-tolerance interpretation assumes independent fault domains;
      // this helper only computes a count and cannot prove that the voter identities are independent.
      const f = Math.floor((voters - 1) / 3);
      return Math.floor((voters + f) / 2) + 1;
    }
    case 'unanimous':
      return voters;
    case 'weighted':
      throw new Error('weighted quorum requires member weights');
  }
}

/** True while the remaining unvoted voters could still bring the approvals up to `required`. */
export function canStillReach(approvals: number, rejections: number, voters: number, required: number): boolean {
  const pending = Math.max(0, voters - approvals - rejections);
  return approvals + pending >= required;
}

import type { ColonyMember } from '../types.js';

export const EPHEMERAL_MEMBER_KEY = 'colonyEphemeral';
export interface EphemeralMemberRecord { expiresAt: number; createdBy: string; sweptAt?: number }

export function ephemeralRecord(member: Pick<ColonyMember, 'metadata'>): EphemeralMemberRecord | undefined {
  const record = member.metadata?.[EPHEMERAL_MEMBER_KEY];
  if (!record || typeof record !== 'object') return undefined;
  const candidate = record as Partial<EphemeralMemberRecord>;
  if (!Number.isFinite(candidate.expiresAt) || typeof candidate.createdBy !== 'string') return undefined;
  const sweptAt = Number.isFinite(candidate.sweptAt) ? candidate.sweptAt : undefined;
  return { expiresAt: candidate.expiresAt!, createdBy: candidate.createdBy, ...(sweptAt !== undefined ? { sweptAt } : {}) };
}
export function isEphemeralExpired(member: Pick<ColonyMember, 'metadata'>, now: number = Date.now()): boolean {
  const record = ephemeralRecord(member);
  return record !== undefined && now >= record.expiresAt;
}
export function markEphemeralSwept(member: ColonyMember, now: number): void {
  const record = ephemeralRecord(member);
  if (!record) return;
  member.metadata = { ...(member.metadata ?? {}), [EPHEMERAL_MEMBER_KEY]: { ...record, sweptAt: now } };
}

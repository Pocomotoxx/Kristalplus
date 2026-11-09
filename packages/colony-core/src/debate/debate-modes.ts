import type { AgentRole, DebateMode, DebateModePair } from '../types.js';

export const CONCERNED_CHALLENGER_PROFILE_ID = 'profile_concerned_challenger';
export const MOTHER_PROFILE_ID = 'profile_mother';

export const DEBATE_MODES_BY_ROLE: Readonly<Record<Exclude<AgentRole, 'mother'>, DebateModePair>> = Object.freeze({
  director: { default: 'rational', alternate: 'negotiation' },
  architect: { default: 'rational', alternate: 'fact-finding' },
  engineer: { default: 'rational', alternate: 'courtroom' },
  reviewer: { default: 'courtroom', alternate: 'rational' },
  tester: { default: 'fact-finding', alternate: 'courtroom' },
  analyst: { default: 'fact-finding', alternate: 'rational' },
  security: { default: 'courtroom', alternate: 'fact-finding' },
  auditor: { default: 'courtroom', alternate: 'negotiation' },
  researcher: { default: 'fact-finding', alternate: 'rational' },
  writer: { default: 'negotiation', alternate: 'rational' },
  exobiologist: { default: 'rational', alternate: 'fact-finding' },
  custom: { default: 'rational', alternate: 'fact-finding' },
});

export const CONCERNED_CHALLENGER_DEBATE_MODES: DebateModePair = Object.freeze({
  default: 'quarrel',
  alternate: 'courtroom',
});

export const DEBATE_MODES: readonly DebateMode[] = Object.freeze([
  'rational', 'fact-finding', 'courtroom', 'negotiation', 'quarrel',
]);

export function debateModesForAgent(role: AgentRole, profileId?: string): DebateModePair | null {
  if (role === 'mother' || profileId === MOTHER_PROFILE_ID) return null;
  if (profileId === CONCERNED_CHALLENGER_PROFILE_ID) return CONCERNED_CHALLENGER_DEBATE_MODES;
  return DEBATE_MODES_BY_ROLE[role] ?? DEBATE_MODES_BY_ROLE.custom;
}

export function isDebateMode(value: unknown): value is DebateMode {
  return typeof value === 'string' && DEBATE_MODES.includes(value as DebateMode);
}

export function canUseDebateMode(role: AgentRole, profileId: string | null | undefined, mode: DebateMode): boolean {
  const pair = debateModesForAgent(role, profileId ?? undefined);
  return pair !== null && (mode === pair.default || mode === pair.alternate);
}

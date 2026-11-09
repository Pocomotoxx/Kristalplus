import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_AGENT_PROFILES } from '../agents/agent-profiles.js';
import { canUseDebateMode, DEBATE_MODES, debateModesForAgent, CONCERNED_CHALLENGER_PROFILE_ID } from '../debate/debate-modes.js';

test('every debate mode is registered and every built-in profile has two distinct modes', () => {
  assert.deepEqual(DEBATE_MODES, ['rational', 'fact-finding', 'courtroom', 'negotiation', 'quarrel']);
  for (const profile of Object.values(BUILTIN_AGENT_PROFILES)) {
    assert.ok(profile.debateModes.default);
    assert.ok(profile.debateModes.alternate);
    assert.notEqual(profile.debateModes.default, profile.debateModes.alternate);
  }
});

test('quarrel is available only to the concerned challenger profile', () => {
  for (const profile of Object.values(BUILTIN_AGENT_PROFILES)) {
    if (profile.id !== CONCERNED_CHALLENGER_PROFILE_ID) {
      assert.equal(canUseDebateMode(profile.role, profile.id, 'quarrel'), false);
    }
  }
  const challenger = Object.values(BUILTIN_AGENT_PROFILES).find(profile => profile.id === CONCERNED_CHALLENGER_PROFILE_ID);
  assert.ok(challenger);
  assert.deepEqual(debateModesForAgent(challenger.role, challenger.id), { default: 'quarrel', alternate: 'courtroom' });
  assert.equal(canUseDebateMode(challenger.role, challenger.id, 'quarrel'), true);
});

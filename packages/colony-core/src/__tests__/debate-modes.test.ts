import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_AGENT_PROFILES } from '../agents/agent-profiles.js';
import { canUseDebateMode, DEBATE_MODES, debateModesForAgent, CONCERNED_CHALLENGER_PROFILE_ID, MOTHER_PROFILE_ID } from '../debate/debate-modes.js';

test('every debate mode is registered and every built-in profile has two distinct modes', () => {
  assert.deepEqual(DEBATE_MODES, ['rational', 'fact-finding', 'courtroom', 'negotiation', 'quarrel']);
  for (const profile of Object.values(BUILTIN_AGENT_PROFILES)) {
    if (profile.role === 'mother') {
      assert.equal(profile.debateModes, null);
      continue;
    }
    assert.ok(profile.debateModes?.default);
    assert.ok(profile.debateModes?.alternate);
    assert.notEqual(profile.debateModes?.default, profile.debateModes?.alternate);
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


test('Mother is outside every debate mode and is explicitly non-voting', () => {
  const mother = BUILTIN_AGENT_PROFILES.mother;
  assert.equal(mother.id, MOTHER_PROFILE_ID);
  assert.equal(mother.debateModes, null);
  for (const mode of DEBATE_MODES) assert.equal(canUseDebateMode('mother', mother.id, mode), false);
  assert.equal(debateModesForAgent('mother', mother.id), null);
  assert.equal(mother.sampling?.temperature, 0);
  assert.match(mother.systemPrompt, /only from the evidence explicitly supplied/);
  assert.match(mother.systemPrompt, /multiple relevant perspectives/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_AGENT_PROFILES } from './agent-profiles.js';
import { buildTaskSkillContext, GENERAL_AGENT_SKILLS } from './agent-skills.js';
import type { ColonyMember } from '../types.js';

const member: ColonyMember = {
  id: 'member_custom',
  name: 'Custom agent',
  role: 'custom',
  status: 'idle',
  capabilities: { tools: [], maxConcurrentTasks: 1, specializations: ['domain:climate', 'release-operations'] },
  currentTaskIds: [],
  createdAt: 0,
  lastActiveAt: 0,
};

test('all built-in profiles receive the same general skill set', () => {
  for (const profile of Object.values(BUILTIN_AGENT_PROFILES)) {
    assert.deepEqual(profile.generalSkills, GENERAL_AGENT_SKILLS);
  }
});

test('task skill context activates only task-requested profile skills and specializations', () => {
  const profile = { generalSkills: GENERAL_AGENT_SKILLS, capabilities: ['research', 'climate-analysis'] };
  const context = buildTaskSkillContext(profile, member, {
    title: 'Assess regional warming',
    description: 'Estimate local heat risks.',
    requiredCapabilities: ['climate-analysis', 'domain:climate'],
  });
  assert.deepEqual(context.requestedTaskSkills, ['climate-analysis', 'domain:climate']);
  assert.deepEqual(context.applicableProfileSkills, ['climate-analysis']);
  assert.deepEqual(context.activeSpecializations, ['domain:climate']);
  assert.match(context.adaptationGuidance, /unrelated domain expertise inactive/);
});

test('without explicit specialist requirements, task brief drives assignment-specific adaptation', () => {
  const context = buildTaskSkillContext(undefined, member, {
    title: 'Summarize the policy',
    description: 'Compare the stated options.',
  });
  assert.deepEqual(context.generalSkills, GENERAL_AGENT_SKILLS);
  assert.deepEqual(context.requestedTaskSkills, []);
  assert.deepEqual(context.applicableProfileSkills, []);
  assert.deepEqual(context.activeSpecializations, []);
  assert.equal(context.taskFocus.title, 'Summarize the policy');
  assert.match(context.adaptationGuidance, /Infer the needed subject knowledge/);
});

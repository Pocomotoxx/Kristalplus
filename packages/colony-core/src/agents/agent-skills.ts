import type { ColonyMember, ColonyTask } from '../types.js';
import type { ColonyAgentProfile } from './agent-profiles.js';

export const GENERAL_AGENT_SKILLS: readonly string[] = Object.freeze([
  'clear-communication',
  'structured-planning',
  'evidence-assessment',
  'uncertainty-calibration',
  'risk-identification',
  'task-scoped-learning',
  'verification-and-quality',
  'collaborative-handoff',
  'safety-and-boundary-awareness',
]);

export interface TaskSkillContext {
  generalSkills: readonly string[];
  taskFocus: { title: string; description: string };
  requestedTaskSkills: readonly string[];
  applicableProfileSkills: readonly string[];
  activeSpecializations: readonly string[];
  adaptationGuidance: string;
}

/**
 * Builds the skills payload for one assignment. Profile expertise and member specializations are
 * surfaced only when the task explicitly requests them; the host adapts all other domain knowledge
 * from this task's brief and records uncertainty where the brief is underspecified.
 */
export function buildTaskSkillContext(
  profile: Pick<ColonyAgentProfile, 'generalSkills' | 'capabilities'> | undefined,
  member: ColonyMember,
  task: Pick<ColonyTask, 'title' | 'description' | 'requiredCapabilities'>,
): TaskSkillContext {
  const requested = [...new Set((task.requiredCapabilities ?? []).map((value) => value.trim()).filter(Boolean))];
  const requestedSet = new Set(requested);
  const applicableProfileSkills = (profile?.capabilities ?? []).filter((skill) => requestedSet.has(skill));
  const activeSpecializations = (member.capabilities.specializations ?? []).filter((specialization) => requestedSet.has(specialization));

  return {
    generalSkills: profile?.generalSkills ?? GENERAL_AGENT_SKILLS,
    taskFocus: { title: task.title, description: task.description },
    requestedTaskSkills: requested,
    applicableProfileSkills,
    activeSpecializations,
    adaptationGuidance: requested.length
      ? 'Use the requested task skills and matching specializations for this assignment. Keep unrelated domain expertise inactive; adapt details to the task brief and state assumptions or knowledge gaps.'
      : 'No specialist skill was explicitly requested. Infer the needed subject knowledge from this task brief, adapt it only to this assignment, and state assumptions or knowledge gaps.',
  };
}

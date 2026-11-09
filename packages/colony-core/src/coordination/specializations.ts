import type { ColonySpecialization } from '../types.js';

/** Colony-native role specializations; these extend capabilities without multiplying role names. */
export const RELEASE_SPECIALIZATION = 'release-operations';

export function parseSpecializations(input?: string): ColonySpecialization[] {
  if (!input?.trim()) return [];
  const values = input.split(',').map((value) => value.trim().toLowerCase());
  if (values.some((value) => !value)) throw new Error('specializations must be comma-separated non-empty values');
  const unique = [...new Set(values)];
  for (const value of unique) {
    if (value === RELEASE_SPECIALIZATION) continue;
    if (/^domain:[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) continue;
    throw new Error(`unknown specialization '${value}' (use release-operations or domain:<slug>)`);
  }
  return unique as ColonySpecialization[];
}

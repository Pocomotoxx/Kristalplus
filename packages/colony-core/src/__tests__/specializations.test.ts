import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSpecializations } from '../coordination/specializations.js';

test('domain and release specializations are normalized and deduplicated', () => {
  assert.deepEqual(parseSpecializations(' DOMAIN:payments,release-operations,domain:payments '), [
    'domain:payments',
    'release-operations',
  ]);
});

test('specializations reject unknown tags and malformed domains', () => {
  assert.throws(() => parseSpecializations('domain:bad slug'), /unknown specialization/);
  assert.throws(() => parseSpecializations('release'), /unknown specialization/);
  assert.throws(() => parseSpecializations('domain:payments,,release-operations'), /non-empty/);
});

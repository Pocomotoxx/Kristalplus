import { test } from 'node:test';
import assert from 'node:assert/strict';
import { synthesizeReports } from '../chief/synthesis.js';

const report = (id: string, text: string) => ({ task: { id, title: id }, text });

test('selects the report with the greatest pairwise lexical agreement', () => {
  const result = synthesizeReports([
    report('a', 'shared alpha beta'),
    report('b', 'shared alpha beta gamma'),
    report('c', 'shared alpha gamma'),
    report('z', 'unrelated astronomy vocabulary'),
  ]);
  assert.equal(result.heuristic, true);
  assert.equal(result.method, 'lexical-jaccard-medoid');
  assert.equal(result.selected.taskId, 'b');
  assert.ok(result.agreement.terms.includes('shared'));
  assert.ok(result.reports.find((r) => r.taskId === 'z')?.outlier);
});

test('breaks equal medoid scores by task id and caps returned source text', () => {
  const result = synthesizeReports([report('b', 'same evidence'), report('a', 'same evidence')], { maxReportChars: 4 });
  assert.equal(result.selected.taskId, 'a');
  assert.equal(result.reports[0].text, 'same…');
  assert.equal(result.reports[0].truncated, true);
});

test('rejects missing, duplicate, empty and invalid inputs', () => {
  assert.throws(() => synthesizeReports([]), /at least one/);
  assert.throws(() => synthesizeReports([report('a', 'x'), report('a', 'y')]), /duplicate/);
  assert.throws(() => synthesizeReports([report('a', '  ')]), /non-empty/);
  assert.throws(() => synthesizeReports([report('a', 'text')], { outlierThreshold: 2 }), /between 0 and 1/);
});

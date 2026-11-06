import type { ColonyTask } from '../types.js';

export interface SynthesisInput {
  task: Pick<ColonyTask, 'id' | 'title'>;
  text: string;
  reporterId?: string;
}

export interface SynthesisOptions {
  /** Similarity below this value marks a report as an outlier. This is a lexical heuristic. */
  outlierThreshold?: number;
  /** Maximum text returned for any one source report. */
  maxReportChars?: number;
}

export interface SynthesizedReport {
  taskId: string;
  title: string;
  reporterId?: string;
  text: string;
  similarityToSelected: number;
  outlier: boolean;
  truncated: boolean;
}

export interface SynthesisResult {
  heuristic: true;
  method: 'lexical-jaccard-medoid';
  outlierThreshold: number;
  selected: Omit<SynthesizedReport, 'similarityToSelected' | 'outlier' | 'truncated'>;
  agreement: { minimumReports: number; terms: string[] };
  reports: SynthesizedReport[];
  note: string;
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'into', 'are', 'was', 'not', 'all', 'any', 'out', 'new', 'make', 'part',
  'egy', 'hogy', 'vagy', 'meg', 'azt', 'van', 'nem', 'jó', 'már', 'még', 'is', 'és', 'ami', 'ezt', 'volt', 'lesz', 'kell',
]);
const compareText = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;
const tokens = (text: string): Set<string> => new Set(
  (text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []).filter((token) => !STOP_WORDS.has(token))
);

function jaccard(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection++;
  return intersection / (left.size + right.size - intersection);
}

function displayText(text: string, maxChars: number): { text: string; truncated: boolean } {
  const trimmed = text.trim();
  const chars = Array.from(trimmed);
  return chars.length <= maxChars
    ? { text: trimmed, truncated: false }
    : { text: `${chars.slice(0, maxChars).join('')}…`, truncated: true };
}

/**
 * Select the most representative host report and expose lexical agreement and outliers.
 * This is deterministic evidence for a host to synthesize; it does not generate a summary or
 * claim that similar wording is factually correct.
 */
export function synthesizeReports(inputs: readonly SynthesisInput[], options: SynthesisOptions = {}): SynthesisResult {
  const threshold = options.outlierThreshold ?? 0.2;
  const maxChars = options.maxReportChars ?? 4000;
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) throw new Error('outlierThreshold must be between 0 and 1');
  if (!Number.isInteger(maxChars) || maxChars < 1) throw new Error('maxReportChars must be a positive integer');
  if (inputs.length === 0) throw new Error('at least one report is required');

  const seen = new Set<string>();
  const reports = inputs.map((input) => {
    if (!input.task.id.trim() || !input.text.trim()) throw new Error('each report needs a task id and non-empty text');
    if (seen.has(input.task.id)) throw new Error(`duplicate report task '${input.task.id}'`);
    seen.add(input.task.id);
    return { input, terms: tokens(input.text) };
  }).sort((a, b) => compareText(a.input.task.id, b.input.task.id));

  let selectedIndex = 0;
  let bestScore = -1;
  for (let i = 0; i < reports.length; i++) {
    let score = 0;
    for (let j = 0; j < reports.length; j++) if (i !== j) score += jaccard(reports[i].terms, reports[j].terms);
    if (score > bestScore + Number.EPSILON) {
      bestScore = score;
      selectedIndex = i;
    }
  }

  const selected = reports[selectedIndex];
  const minimumReports = Math.ceil(reports.length * 0.6);
  const support = new Map<string, number>();
  for (const report of reports) for (const token of report.terms) support.set(token, (support.get(token) ?? 0) + 1);
  const agreementTerms = [...support.entries()]
    .filter(([, count]) => count >= minimumReports)
    .sort((a, b) => b[1] - a[1] || compareText(a[0], b[0]))
    .slice(0, 20)
    .map(([token]) => token);

  const rendered = reports.map(({ input, terms }) => {
    const similarityToSelected = jaccard(terms, selected.terms);
    const shown = displayText(input.text, maxChars);
    return {
      taskId: input.task.id,
      title: input.task.title,
      ...(input.reporterId ? { reporterId: input.reporterId } : {}),
      ...shown,
      similarityToSelected: Math.round(similarityToSelected * 1000) / 1000,
      outlier: input.task.id !== selected.input.task.id && similarityToSelected < threshold,
    };
  });
  const selectedReport = rendered.find((report) => report.taskId === selected.input.task.id)!;

  return {
    heuristic: true,
    method: 'lexical-jaccard-medoid',
    outlierThreshold: threshold,
    selected: {
      taskId: selectedReport.taskId,
      title: selectedReport.title,
      ...(selectedReport.reporterId ? { reporterId: selectedReport.reporterId } : {}),
      text: selectedReport.text,
    },
    agreement: { minimumReports, terms: agreementTerms },
    reports: rendered,
    note: 'The selected report is the lexical medoid. Shared words and similarity are heuristic, do not measure meaning or truth, and do not replace host synthesis or source verification.',
  };
}

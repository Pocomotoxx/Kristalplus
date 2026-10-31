import { IEmbeddingProvider } from './types.js';

export interface MockEmbeddingOptions {
  dimension?: number;
}

/**
 * Deterministic local embedding provider.
 * No network, no model, no API key: the colony core never depends on an external service.
 */
export class DeterministicEmbeddingProvider implements IEmbeddingProvider {
  public name = 'deterministic-local';
  public dimension: number;

  constructor(options: MockEmbeddingOptions = {}) {
    this.dimension = options.dimension || 128;
  }

  public async embedText(text: string): Promise<number[]> {
    const vector = new Array(this.dimension).fill(0);
    const clean = text.toLowerCase();

    for (let i = 0; i < clean.length; i++) {
      const code = clean.charCodeAt(i);
      const index = (code * 31 + i) % this.dimension;
      vector[index] += 1.0;
    }

    // Normalize vector
    let sumSquares = 0;
    for (let i = 0; i < this.dimension; i++) {
      sumSquares += vector[i] * vector[i];
    }
    const mag = Math.sqrt(sumSquares) || 1;
    return vector.map((v) => v / mag);
  }

  public async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.embedText(t)));
  }
}

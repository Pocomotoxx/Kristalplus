import { IEmbeddingProvider } from './types.js';

export interface MockEmbeddingOptions {
  dimension?: number;
}

/**
 * Deterministic Mock/Local Fallback Embedding Provider
 * Useful for fast zero-network testing and fallback scenarios
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

/**
 * Universal REST/OpenAI-compatible Embedding Provider
 * Works with OpenAI, OpenRouter, LocalAI, vLLM, Ollama, etc.
 */
export class OpenAiCompatibleEmbeddingProvider implements IEmbeddingProvider {
  public name: string;
  public dimension: number;
  private endpoint: string;
  private apiKey: string;
  private model: string;

  constructor(options: {
    name?: string;
    endpoint?: string;
    apiKey?: string;
    model?: string;
    dimension?: number;
  }) {
    this.name = options.name || 'openai-compatible';
    this.endpoint = options.endpoint || 'https://api.openai.com/v1/embeddings';
    this.apiKey = options.apiKey || process.env.OPENAI_API_KEY || '';
    this.model = options.model || 'text-embedding-3-small';
    this.dimension = options.dimension || 1536;
  }

  public async embedText(text: string): Promise<number[]> {
    const batch = await this.embedBatch([text]);
    return batch[0];
  }

  public async embedBatch(texts: string[]): Promise<number[][]> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        input: texts,
        model: this.model,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Embedding request failed (${response.status}): ${err}`);
    }

    const json = (await response.json()) as {
      data: Array<{ embedding: number[]; index: number }>;
    };

    return json.data.sort((a, b) => a.index - b.index).map((item) => item.embedding);
  }
}

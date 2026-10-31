import { IEmbeddingProvider, IVectorStore, MemoryDocument, SearchResult, SearchOptions } from './types.js';
import { InMemoryVectorStore } from './vector-store.js';
import { DeterministicEmbeddingProvider } from './embedding-providers.js';

export interface VectorCodexConfig {
  embeddingProvider?: IEmbeddingProvider;
  vectorStore?: IVectorStore;
}

/**
 * VectorCodex - Model-agnostic knowledge & vector memory engine
 * Integrates embedding generation, semantic similarity, and document retrieval
 */
export class VectorCodex {
  public readonly embeddings: IEmbeddingProvider;
  public readonly store: IVectorStore;

  constructor(config: VectorCodexConfig = {}) {
    this.embeddings = config.embeddingProvider || new DeterministicEmbeddingProvider();
    this.store = config.vectorStore || new InMemoryVectorStore();
  }

  /**
   * Index one or multiple documents into the vector store
   */
  public async storeDocuments(
    docs: Array<{ id?: string; text: string; namespace?: string; metadata?: Record<string, unknown> }>
  ): Promise<MemoryDocument[]> {
    const texts = docs.map((d) => d.text);
    const vectors = await this.embeddings.embedBatch(texts);

    const documents: MemoryDocument[] = docs.map((doc, idx) => ({
      id: doc.id || `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      text: doc.text,
      vector: vectors[idx],
      namespace: doc.namespace,
      metadata: doc.metadata || {},
      createdAt: Date.now(),
    }));

    await this.store.upsert(documents);
    return documents;
  }

  /**
   * Search memory documents using natural language query
   */
  public async search(queryText: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const queryVector = await this.embeddings.embedText(queryText);
    return this.store.search(queryVector, options);
  }

  public async count(namespace?: string): Promise<number> {
    return this.store.count(namespace);
  }

  public async clear(namespace?: string): Promise<void> {
    return this.store.clear(namespace);
  }
}

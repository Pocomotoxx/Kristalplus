import fs from 'node:fs/promises';
import path from 'node:path';
import { IVectorStore, MemoryDocument, SearchOptions, SearchResult } from './types.js';
import { cosineSimilarity } from './vector-store.js';

export interface FileVectorStoreOptions {
  storagePath: string; // File path e.g. .colony/memory.json
}

/**
 * File-backed Persistent Vector Store
 * Synchronizes vector memory, reasoning patterns, and knowledge directly into git workspace files
 */
export class FileVectorStore implements IVectorStore {
  private storagePath: string;
  private docs = new Map<string, MemoryDocument>();
  private isLoaded = false;

  constructor(options: FileVectorStoreOptions) {
    this.storagePath = options.storagePath;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.isLoaded) return;

    try {
      const data = await fs.readFile(this.storagePath, 'utf-8');
      const parsed: MemoryDocument[] = JSON.parse(data);
      this.docs.clear();
      for (const doc of parsed) {
        this.docs.set(doc.id, doc);
      }
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        console.warn(`[FileVectorStore] Warning reading ${this.storagePath}:`, err.message);
      }
      this.docs.clear();
    }
    this.isLoaded = true;
  }

  private async persist(): Promise<void> {
    const dir = path.dirname(this.storagePath);
    await fs.mkdir(dir, { recursive: true });
    const serialized = JSON.stringify(Array.from(this.docs.values()), null, 2);
    await fs.writeFile(this.storagePath, serialized, 'utf-8');
  }

  public async upsert(documents: MemoryDocument[]): Promise<void> {
    await this.ensureLoaded();
    for (const doc of documents) {
      this.docs.set(doc.id, { ...doc });
    }
    await this.persist();
  }

  public async search(queryVector: number[], options: SearchOptions = {}): Promise<SearchResult[]> {
    await this.ensureLoaded();
    const topK = options.topK ?? 5;
    const minScore = options.minScore ?? 0.0;
    const namespace = options.namespace;

    const results: SearchResult[] = [];

    for (const doc of this.docs.values()) {
      if (namespace && doc.namespace !== namespace) {
        continue;
      }
      if (!doc.vector || doc.vector.length === 0) {
        continue;
      }

      const score = cosineSimilarity(queryVector, doc.vector);
      if (score >= minScore) {
        results.push({ document: doc, score });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  public async delete(ids: string[]): Promise<void> {
    await this.ensureLoaded();
    for (const id of ids) {
      this.docs.delete(id);
    }
    await this.persist();
  }

  public async count(namespace?: string): Promise<number> {
    await this.ensureLoaded();
    if (!namespace) return this.docs.size;
    let count = 0;
    for (const doc of this.docs.values()) {
      if (doc.namespace === namespace) count++;
    }
    return count;
  }

  public async clear(namespace?: string): Promise<void> {
    await this.ensureLoaded();
    if (!namespace) {
      this.docs.clear();
    } else {
      for (const [id, doc] of this.docs.entries()) {
        if (doc.namespace === namespace) {
          this.docs.delete(id);
        }
      }
    }
    await this.persist();
  }
}

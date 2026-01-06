/**
 * Chunk Embedding Service
 *
 * Generates embeddings for document chunks using the existing embed provider.
 * Supports batch processing and progress tracking.
 */

import { generateEmbedding, generateEmbeddings } from '../../../providers/embeddings.js';
import { DocumentChunk } from './types.js';
import { updateChunkEmbeddings, getChunksByObjectId } from './chunkStorage.js';

// === EMBEDDING GENERATION ===

/**
 * Generate embeddings for an array of chunks
 * Updates the chunks in-place with embeddings
 */
export async function generateChunkEmbeddings(
  chunks: DocumentChunk[],
  options: {
    batchSize?: number;
    onProgress?: (completed: number, total: number) => void;
  } = {}
): Promise<DocumentChunk[]> {
  const { batchSize = 10, onProgress } = options;

  if (chunks.length === 0) return chunks;

  // Process in batches to avoid overwhelming the embedding service
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const texts = batch.map((c) => c.content);

    const embeddings = await generateEmbeddings(texts);

    // Update chunks with embeddings
    batch.forEach((chunk, idx) => {
      chunk.embedding = embeddings[idx];
    });

    // Report progress
    if (onProgress) {
      onProgress(Math.min(i + batchSize, chunks.length), chunks.length);
    }
  }

  return chunks;
}

/**
 * Generate embedding for a single chunk
 */
export async function generateChunkEmbedding(chunk: DocumentChunk): Promise<DocumentChunk> {
  const embedding = await generateEmbedding(chunk.content);
  chunk.embedding = embedding;
  return chunk;
}

// === STORE WITH EMBEDDINGS ===

/**
 * Generate embeddings and store them for existing chunks in the database
 */
export async function embedAndStoreChunks(
  objectId: string,
  options: {
    batchSize?: number;
    onProgress?: (completed: number, total: number) => void;
  } = {}
): Promise<number> {
  const { batchSize = 10, onProgress } = options;

  // Get chunks for this document
  const chunks = await getChunksByObjectId(objectId);

  if (chunks.length === 0) return 0;

  // Filter to chunks without embeddings
  const chunksToEmbed = chunks.filter((c) => !c.embedding);

  if (chunksToEmbed.length === 0) return 0;

  // Generate embeddings in batches
  const updates: Array<{ chunkId: string; embedding: number[] }> = [];

  for (let i = 0; i < chunksToEmbed.length; i += batchSize) {
    const batch = chunksToEmbed.slice(i, i + batchSize);
    const texts = batch.map((c) => c.content);

    const embeddings = await generateEmbeddings(texts);

    batch.forEach((chunk, idx) => {
      const embedding = embeddings[idx];
      if (embedding) {
        updates.push({ chunkId: chunk.id, embedding });
      }
    });

    if (onProgress) {
      onProgress(Math.min(i + batchSize, chunksToEmbed.length), chunksToEmbed.length);
    }
  }

  // Batch update all embeddings
  if (updates.length > 0) {
    await updateChunkEmbeddings(updates);
  }

  return updates.length;
}

// === QUERY EMBEDDING ===

/**
 * Generate an embedding for a search query
 * (convenience wrapper for semantic chunk search)
 */
export async function generateQueryEmbedding(query: string): Promise<number[]> {
  return generateEmbedding(query);
}

// === UTILITY ===

/**
 * Check if all chunks for a document have embeddings
 */
export async function hasAllEmbeddings(objectId: string): Promise<boolean> {
  const chunks = await getChunksByObjectId(objectId);
  return chunks.length > 0 && chunks.every((c) => c.embedding != null);
}

/**
 * Get embedding coverage for a document
 */
export async function getEmbeddingCoverage(objectId: string): Promise<{
  total: number;
  embedded: number;
  percentage: number;
}> {
  const chunks = await getChunksByObjectId(objectId);
  const embedded = chunks.filter((c) => c.embedding != null).length;

  return {
    total: chunks.length,
    embedded,
    percentage: chunks.length > 0 ? (embedded / chunks.length) * 100 : 0,
  };
}

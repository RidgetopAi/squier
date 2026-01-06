/**
 * Document Chunking Module
 *
 * Exports types and implementations for splitting documents
 * into semantic chunks for RAG storage.
 */

// Types
export * from './types.js';

// Chunker implementations
export { fixedChunker, countTokens, truncateToTokens } from './fixedChunker.js';
export { semanticChunker, detectSections } from './semanticChunker.js';
export { hybridChunker } from './hybridChunker.js';

// Storage
export {
  storeChunks,
  storeChunk,
  getChunksByObjectId,
  getChunkById,
  getChunkCount,
  updateChunkEmbedding,
  updateChunkEmbeddings,
  deleteChunksByObjectId,
  deleteChunk,
  searchChunksBySimilarity,
  searchChunksByText,
  getChunkStats,
  isDocumentChunked,
} from './chunkStorage.js';

// Embeddings
export {
  generateChunkEmbeddings,
  generateChunkEmbedding,
  embedAndStoreChunks,
  generateQueryEmbedding,
  hasAllEmbeddings,
  getEmbeddingCoverage,
} from './chunkEmbedding.js';

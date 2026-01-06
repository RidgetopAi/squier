/**
 * Document Extraction Module
 *
 * Provides text extraction from various document formats:
 * - PDF (pdf-parse)
 * - DOCX (mammoth)
 * - Plain text and Markdown (passthrough)
 * - Images via OCR (tesseract.js)
 */

// Main extractor API
export {
  extractDocument,
  extractFromFile,
  extractFromBuffer,
  isSupported,
  getSupportedMimeTypes,
} from './extractor.js';

// Types
export * from './types.js';

// Individual extractors (for advanced usage)
export { pdfExtractor } from './pdfExtractor.js';
export { docxExtractor } from './docxExtractor.js';
export { textExtractor } from './textExtractor.js';
export { ocrExtractor } from './ocrExtractor.js';

// Chunking module
export * from './chunker/index.js';

// Search service
export {
  searchDocuments,
  searchDocumentsOptimized,
  searchForContext,
  getSearchStats,
  type DocumentSearchResult,
  type SearchOptions,
  type SearchResponse,
  type ContextChunk,
} from './search.js';

// Ephemeral processing (Path 2: Direct-to-LLM)
export {
  extractEphemeral,
  summarizeDocument,
  askDocument,
  getCacheStats,
  clearCaches,
  type EphemeralDocument,
  type SummarizeOptions,
  type SummarizeResult,
  type AskOptions,
  type AskResult,
} from './ephemeral.js';

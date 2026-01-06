/**
 * Document Extraction & Chunking API Routes
 *
 * Provides endpoints for extracting text and metadata from documents,
 * chunking documents for RAG storage, and searching chunks.
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import {
  extractFromBuffer,
  isSupported,
  getSupportedMimeTypes,
  ExtractionOptions,
  // Chunking
  hybridChunker,
  fixedChunker,
  semanticChunker,
  ChunkingOptions,
  storeChunks,
  getChunksByObjectId,
  getChunkStats,
  deleteChunksByObjectId,
  searchChunksBySimilarity,
  searchChunksByText,
  generateChunkEmbeddings,
  embedAndStoreChunks,
  generateQueryEmbedding,
} from '../../services/documents/index.js';
import { getObjectById } from '../../services/objects.js';

const router = Router();

// Configure multer for file uploads (in-memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
});

// ============================================================================
// EXTRACTION ENDPOINTS
// ============================================================================

/**
 * POST /api/documents/extract
 * Extract text and metadata from an uploaded document
 *
 * Body: multipart/form-data with 'file' field
 * Query params:
 *   - maxTextLength: number (optional)
 *   - preservePageBreaks: boolean (optional)
 *   - ocrLanguage: string (optional, default 'eng')
 *   - ocrConfidenceThreshold: number (optional, 0-1)
 */
router.post('/extract', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const file = req.file;

    if (!file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    // Check if MIME type is supported
    if (!isSupported(file.mimetype)) {
      res.status(400).json({
        error: `Unsupported file type: ${file.mimetype}`,
        supportedTypes: getSupportedMimeTypes(),
      });
      return;
    }

    // Build extraction options from query params
    const options: ExtractionOptions = {};

    if (req.query.maxTextLength) {
      options.maxTextLength = parseInt(req.query.maxTextLength as string, 10);
    }

    if (req.query.preservePageBreaks !== undefined) {
      options.preservePageBreaks = req.query.preservePageBreaks === 'true';
    }

    if (req.query.ocrLanguage) {
      options.ocrLanguage = req.query.ocrLanguage as string;
    }

    if (req.query.ocrConfidenceThreshold) {
      options.ocrConfidenceThreshold = parseFloat(req.query.ocrConfidenceThreshold as string);
    }

    // Perform extraction
    const result = await extractFromBuffer(file.buffer, file.mimetype, options);

    if (!result.success) {
      res.status(422).json({
        error: result.error,
        errorCode: result.errorCode,
      });
      return;
    }

    res.json({
      success: true,
      document: result.document,
      file: {
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
      },
    });
  } catch (error) {
    console.error('Document extraction error:', error);
    res.status(500).json({
      error: 'Internal server error during extraction',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/documents/supported-types
 * Get list of supported MIME types for extraction
 */
router.get('/supported-types', (_req: Request, res: Response) => {
  res.json({
    mimeTypes: getSupportedMimeTypes(),
  });
});

/**
 * POST /api/documents/check-support
 * Check if a MIME type is supported
 *
 * Body: { mimeType: string }
 */
router.post('/check-support', (req: Request, res: Response) => {
  const { mimeType } = req.body;

  if (!mimeType || typeof mimeType !== 'string') {
    res.status(400).json({ error: 'mimeType is required' });
    return;
  }

  res.json({
    mimeType,
    supported: isSupported(mimeType),
  });
});

// ============================================================================
// CHUNKING ENDPOINTS
// ============================================================================

/**
 * POST /api/documents/:id/chunk
 * Chunk a document by object ID
 *
 * Params:
 *   - id: object UUID
 *
 * Body (all optional):
 *   - strategy: 'fixed' | 'semantic' | 'hybrid' (default: 'hybrid')
 *   - maxTokens: number (default: 512)
 *   - overlapTokens: number (default: 50)
 *   - generateEmbeddings: boolean (default: true)
 *   - replaceExisting: boolean (default: true)
 */
router.post('/:id/chunk', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'Document ID is required' });
      return;
    }

    const {
      strategy = 'hybrid',
      maxTokens,
      overlapTokens,
      generateEmbeddings: shouldEmbed = true,
      replaceExisting = true,
    } = req.body;

    // Get the object
    const object = await getObjectById(id);
    if (!object) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    // Check if object has extracted text
    if (!object.extracted_text) {
      res.status(400).json({
        error: 'Document has no extracted text. Run extraction first.',
      });
      return;
    }

    // Delete existing chunks if replacing
    if (replaceExisting) {
      await deleteChunksByObjectId(id);
    }

    // Select chunker based on strategy
    const chunker =
      strategy === 'fixed' ? fixedChunker :
      strategy === 'semantic' ? semanticChunker :
      hybridChunker;

    // Build options
    const options: Partial<ChunkingOptions> = {};
    if (maxTokens !== undefined) options.maxTokens = maxTokens;
    if (overlapTokens !== undefined) options.overlapTokens = overlapTokens;

    // Chunk the document
    const result = await chunker.chunk(object.extracted_text, id, options);

    if (!result.success) {
      res.status(422).json({
        error: result.error,
        errorCode: result.errorCode,
      });
      return;
    }

    // Generate embeddings if requested
    if (shouldEmbed && result.chunks.length > 0) {
      await generateChunkEmbeddings(result.chunks);
    }

    // Store chunks
    await storeChunks(result.chunks);

    res.json({
      success: true,
      objectId: id,
      chunkCount: result.chunks.length,
      totalTokens: result.totalTokens,
      strategy,
      hasEmbeddings: shouldEmbed,
      processingDurationMs: result.processingDurationMs,
    });
  } catch (error) {
    console.error('Document chunking error:', error);
    res.status(500).json({
      error: 'Internal server error during chunking',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/documents/:id/chunks
 * Get all chunks for a document
 *
 * Params:
 *   - id: object UUID
 *
 * Query:
 *   - includeContent: boolean (default: true)
 *   - includeEmbeddings: boolean (default: false)
 */
router.get('/:id/chunks', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'Document ID is required' });
      return;
    }

    const includeContent = req.query.includeContent !== 'false';
    const includeEmbeddings = req.query.includeEmbeddings === 'true';

    const chunks = await getChunksByObjectId(id);

    // Optionally strip content/embeddings to reduce payload
    const result = chunks.map((chunk) => ({
      id: chunk.id,
      chunkIndex: chunk.chunkIndex,
      tokenCount: chunk.tokenCount,
      pageNumber: chunk.pageNumber,
      sectionTitle: chunk.sectionTitle,
      chunkingStrategy: chunk.chunkingStrategy,
      hasEmbedding: chunk.embedding != null,
      ...(includeContent && { content: chunk.content }),
      ...(includeEmbeddings && { embedding: chunk.embedding }),
      metadata: chunk.metadata,
      createdAt: chunk.createdAt,
    }));

    const stats = await getChunkStats(id);

    res.json({
      objectId: id,
      chunks: result,
      stats,
    });
  } catch (error) {
    console.error('Get chunks error:', error);
    res.status(500).json({
      error: 'Internal server error getting chunks',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * DELETE /api/documents/:id/chunks
 * Delete all chunks for a document
 */
router.delete('/:id/chunks', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'Document ID is required' });
      return;
    }

    const deletedCount = await deleteChunksByObjectId(id);

    res.json({
      success: true,
      objectId: id,
      deletedCount,
    });
  } catch (error) {
    console.error('Delete chunks error:', error);
    res.status(500).json({
      error: 'Internal server error deleting chunks',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/documents/:id/chunks/embed
 * Generate embeddings for chunks that don't have them
 */
router.post('/:id/chunks/embed', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'Document ID is required' });
      return;
    }

    const embeddedCount = await embedAndStoreChunks(id);

    res.json({
      success: true,
      objectId: id,
      embeddedCount,
    });
  } catch (error) {
    console.error('Embed chunks error:', error);
    res.status(500).json({
      error: 'Internal server error embedding chunks',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/documents/chunks/search
 * Search chunks across all documents using semantic similarity
 *
 * Body:
 *   - query: string (required)
 *   - limit: number (default: 10)
 *   - threshold: number (default: 0.5)
 *   - objectId: string (optional, to search within a specific document)
 */
router.post('/chunks/search', async (req: Request, res: Response) => {
  try {
    const { query, limit = 10, threshold = 0.5, objectId } = req.body;

    if (!query || typeof query !== 'string') {
      res.status(400).json({ error: 'query is required' });
      return;
    }

    // Generate embedding for query
    const queryEmbedding = await generateQueryEmbedding(query);

    // Search by similarity
    const results = await searchChunksBySimilarity(queryEmbedding, {
      limit,
      threshold,
      objectId,
    });

    res.json({
      query,
      resultCount: results.length,
      results: results.map((chunk) => ({
        id: chunk.id,
        objectId: chunk.objectId,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        tokenCount: chunk.tokenCount,
        sectionTitle: chunk.sectionTitle,
        similarity: chunk.similarity,
      })),
    });
  } catch (error) {
    console.error('Search chunks error:', error);
    res.status(500).json({
      error: 'Internal server error searching chunks',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/documents/chunks/search/text
 * Search chunks by text content (full-text search)
 *
 * Body:
 *   - searchText: string (required)
 *   - limit: number (default: 10)
 *   - objectId: string (optional)
 */
router.post('/chunks/search/text', async (req: Request, res: Response) => {
  try {
    const { searchText, limit = 10, objectId } = req.body;

    if (!searchText || typeof searchText !== 'string') {
      res.status(400).json({ error: 'searchText is required' });
      return;
    }

    const results = await searchChunksByText(searchText, { limit, objectId });

    res.json({
      searchText,
      resultCount: results.length,
      results: results.map((chunk) => ({
        id: chunk.id,
        objectId: chunk.objectId,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        tokenCount: chunk.tokenCount,
        sectionTitle: chunk.sectionTitle,
      })),
    });
  } catch (error) {
    console.error('Text search chunks error:', error);
    res.status(500).json({
      error: 'Internal server error searching chunks',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;

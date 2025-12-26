import { pool } from '../db/pool.js';
import { generateEmbedding } from '../providers/embeddings.js';

export interface Memory {
  id: string;
  raw_observation_id: string | null;
  content: string;
  content_type: string;
  source: string;
  source_metadata: Record<string, unknown>;
  embedding: number[] | null;
  salience_score: number;
  salience_factors: Record<string, unknown>;
  created_at: Date;
  occurred_at: Date | null;
  last_accessed_at: Date | null;
  access_count: number;
  current_strength: number;
  processing_status: string;
  processed_at: Date | null;
}

export interface CreateMemoryInput {
  content: string;
  source?: string;
  content_type?: string;
  source_metadata?: Record<string, unknown>;
  occurred_at?: Date;
}

export interface ListMemoriesOptions {
  limit?: number;
  offset?: number;
  source?: string;
}

/**
 * Store a new memory with embedding
 */
export async function createMemory(input: CreateMemoryInput): Promise<Memory> {
  const {
    content,
    source = 'cli',
    content_type = 'text',
    source_metadata = {},
    occurred_at,
  } = input;

  // First, store the raw observation (immutable input)
  const rawObsResult = await pool.query(
    `INSERT INTO raw_observations (content, content_type, source, source_metadata, occurred_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [content, content_type, source, JSON.stringify(source_metadata), occurred_at]
  );
  const rawObservationId = rawObsResult.rows[0]?.id as string;

  // Generate embedding for semantic search
  const embedding = await generateEmbedding(content);
  const embeddingStr = `[${embedding.join(',')}]`;

  // Create the memory with embedding
  // For Slice 1, salience is default (5.0) - scoring comes in Slice 2
  const result = await pool.query(
    `INSERT INTO memories (
      raw_observation_id, content, content_type, source, source_metadata,
      embedding, occurred_at, processing_status, processed_at
    )
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'processed', NOW())
     RETURNING *`,
    [
      rawObservationId,
      content,
      content_type,
      source,
      JSON.stringify(source_metadata),
      embeddingStr,
      occurred_at,
    ]
  );

  return result.rows[0] as Memory;
}

/**
 * Get a single memory by ID
 */
export async function getMemory(id: string): Promise<Memory | null> {
  const result = await pool.query(
    `UPDATE memories
     SET last_accessed_at = NOW(), access_count = access_count + 1
     WHERE id = $1
     RETURNING *`,
    [id]
  );
  return (result.rows[0] as Memory) ?? null;
}

/**
 * List memories with optional filtering
 */
export async function listMemories(options: ListMemoriesOptions = {}): Promise<Memory[]> {
  const { limit = 50, offset = 0, source } = options;

  let query = `
    SELECT * FROM memories
    WHERE 1=1
  `;
  const params: (string | number)[] = [];
  let paramIndex = 1;

  if (source) {
    query += ` AND source = $${paramIndex}`;
    params.push(source);
    paramIndex++;
  }

  query += ` ORDER BY created_at DESC`;
  query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);

  const result = await pool.query(query, params);
  return result.rows as Memory[];
}

/**
 * Get total count of memories
 */
export async function countMemories(): Promise<number> {
  const result = await pool.query('SELECT COUNT(*) as count FROM memories');
  return parseInt(result.rows[0]?.count ?? '0', 10);
}

/**
 * Delete a memory by ID
 */
export async function deleteMemory(id: string): Promise<boolean> {
  const result = await pool.query('DELETE FROM memories WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

export interface SearchMemoriesOptions {
  limit?: number;
  minSimilarity?: number;
}

export interface SearchResult extends Memory {
  similarity: number;
}

/**
 * Semantic search for memories using vector similarity
 */
export async function searchMemories(
  query: string,
  options: SearchMemoriesOptions = {}
): Promise<SearchResult[]> {
  const { limit = 10, minSimilarity = 0.3 } = options;

  // Generate embedding for the search query
  const queryEmbedding = await generateEmbedding(query);
  const embeddingStr = `[${queryEmbedding.join(',')}]`;

  // Search using cosine similarity (1 - cosine_distance)
  // pgvector uses <=> for cosine distance, so similarity = 1 - distance
  const result = await pool.query(
    `SELECT *,
       1 - (embedding <=> $1::vector) as similarity
     FROM memories
     WHERE embedding IS NOT NULL
       AND 1 - (embedding <=> $1::vector) >= $2
     ORDER BY embedding <=> $1::vector
     LIMIT $3`,
    [embeddingStr, minSimilarity, limit]
  );

  return result.rows as SearchResult[];
}

/**
 * Get memories for context injection
 * Combines recency and semantic relevance
 */
export async function getContextMemories(
  query?: string,
  options: { limit?: number; recentCount?: number } = {}
): Promise<{ recent: Memory[]; relevant: SearchResult[] }> {
  const { limit = 10, recentCount = 5 } = options;

  // Always get recent memories
  const recent = await listMemories({ limit: recentCount });

  // If query provided, also get semantically relevant memories
  let relevant: SearchResult[] = [];
  if (query) {
    relevant = await searchMemories(query, { limit });
    // Filter out any that are already in recent
    const recentIds = new Set(recent.map((m) => m.id));
    relevant = relevant.filter((m) => !recentIds.has(m.id));
  }

  return { recent, relevant };
}

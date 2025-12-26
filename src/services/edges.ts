import { pool } from '../db/pool.js';
import { Memory } from './memories.js';

export type EdgeType = 'SIMILAR' | 'FOLLOWS' | 'CONTRADICTS' | 'ELABORATES';

export interface MemoryEdge {
  id: string;
  source_memory_id: string;
  target_memory_id: string;
  edge_type: EdgeType;
  weight: number;
  similarity: number | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  last_reinforced_at: Date;
  reinforcement_count: number;
}

export interface RelatedMemory extends Memory {
  edge_type: EdgeType;
  edge_weight: number;
  edge_similarity: number | null;
}

/**
 * Get memories related to a given memory via edges
 * Deduplicates when both A→B and B→A edges exist
 */
export async function getRelatedMemories(
  memoryId: string,
  options: {
    edgeType?: EdgeType;
    minWeight?: number;
    limit?: number;
  } = {}
): Promise<RelatedMemory[]> {
  const { edgeType = 'SIMILAR', minWeight = 0.2, limit = 10 } = options;

  // Use DISTINCT ON to deduplicate when both directions of an edge exist
  const result = await pool.query(
    `SELECT DISTINCT ON (m.id)
       m.*,
       e.edge_type,
       e.weight as edge_weight,
       e.similarity as edge_similarity
     FROM memory_edges e
     JOIN memories m ON (
       CASE
         WHEN e.source_memory_id = $1 THEN e.target_memory_id
         ELSE e.source_memory_id
       END = m.id
     )
     WHERE (e.source_memory_id = $1 OR e.target_memory_id = $1)
       AND e.edge_type = $2
       AND e.weight >= $3
     ORDER BY m.id, e.weight DESC, e.similarity DESC NULLS LAST`,
    [memoryId, edgeType, minWeight]
  );

  // Re-sort by weight/similarity after deduplication and apply limit
  const sorted = (result.rows as RelatedMemory[]).sort((a, b) => {
    if (b.edge_weight !== a.edge_weight) return b.edge_weight - a.edge_weight;
    const aSim = a.edge_similarity ?? 0;
    const bSim = b.edge_similarity ?? 0;
    return bSim - aSim;
  });

  return sorted.slice(0, limit);
}

/**
 * Get all edges for a memory (outgoing and incoming)
 */
export async function getEdgesForMemory(
  memoryId: string,
  options: { edgeType?: EdgeType } = {}
): Promise<MemoryEdge[]> {
  const { edgeType } = options;

  let query = `
    SELECT * FROM memory_edges
    WHERE source_memory_id = $1 OR target_memory_id = $1
  `;
  const params: (string | EdgeType)[] = [memoryId];

  if (edgeType) {
    query += ` AND edge_type = $2`;
    params.push(edgeType);
  }

  query += ` ORDER BY weight DESC`;

  const result = await pool.query(query, params);
  return result.rows as MemoryEdge[];
}

/**
 * Get edge statistics
 */
export async function getEdgeStats(): Promise<{
  total: number;
  byType: Record<EdgeType, number>;
  averageWeight: number;
  averageSimilarity: number;
}> {
  const result = await pool.query(`
    SELECT
      COUNT(*) as total,
      AVG(weight) as avg_weight,
      AVG(similarity) FILTER (WHERE similarity IS NOT NULL) as avg_similarity
    FROM memory_edges
  `);

  const typeResult = await pool.query(`
    SELECT edge_type, COUNT(*) as count
    FROM memory_edges
    GROUP BY edge_type
  `);

  const byType: Record<EdgeType, number> = {
    SIMILAR: 0,
    FOLLOWS: 0,
    CONTRADICTS: 0,
    ELABORATES: 0,
  };

  for (const row of typeResult.rows) {
    byType[row.edge_type as EdgeType] = parseInt(row.count, 10);
  }

  const stats = result.rows[0];
  return {
    total: parseInt(stats.total ?? '0', 10),
    byType,
    averageWeight: parseFloat(stats.avg_weight ?? '1.0'),
    averageSimilarity: parseFloat(stats.avg_similarity ?? '0.0'),
  };
}

/**
 * Count edges for a specific memory
 */
export async function countEdgesForMemory(memoryId: string): Promise<number> {
  const result = await pool.query(
    `SELECT COUNT(*) as count FROM memory_edges
     WHERE source_memory_id = $1 OR target_memory_id = $1`,
    [memoryId]
  );
  return parseInt(result.rows[0]?.count ?? '0', 10);
}

/**
 * Find strongly connected memory clusters
 * Returns memories that share multiple high-weight edges
 */
export async function findConnectedCluster(
  memoryId: string,
  depth: number = 2
): Promise<Memory[]> {
  // BFS traversal to find connected memories up to specified depth
  const result = await pool.query(
    `WITH RECURSIVE connected AS (
       -- Start with the seed memory
       SELECT $1::uuid as memory_id, 0 as depth

       UNION ALL

       -- Find connected memories
       SELECT
         CASE
           WHEN e.source_memory_id = c.memory_id THEN e.target_memory_id
           ELSE e.source_memory_id
         END as memory_id,
         c.depth + 1 as depth
       FROM connected c
       JOIN memory_edges e ON (e.source_memory_id = c.memory_id OR e.target_memory_id = c.memory_id)
       WHERE c.depth < $2
         AND e.weight >= 0.5
     )
     SELECT DISTINCT m.*
     FROM connected c
     JOIN memories m ON m.id = c.memory_id
     WHERE c.memory_id != $1
     ORDER BY m.salience_score DESC
     LIMIT 20`,
    [memoryId, depth]
  );

  return result.rows as Memory[];
}

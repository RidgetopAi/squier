/**
 * Entity Extraction and Management Service
 *
 * Slice 4: Extract named entities from memories (people, projects, concepts, places)
 * Start with regex patterns, optionally enhance with LLM.
 */

import { pool } from '../db/pool.js';
import { generateEmbedding } from '../providers/embeddings.js';

// =============================================================================
// TYPES
// =============================================================================

export type EntityType = 'person' | 'project' | 'concept' | 'place' | 'organization';

export interface Entity {
  id: string;
  name: string;
  canonical_name: string;
  entity_type: EntityType;
  aliases: string[];
  description: string | null;
  attributes: Record<string, unknown>;
  first_seen_at: Date;
  last_seen_at: Date;
  mention_count: number;
  extraction_method: string;
  confidence: number;
  is_merged: boolean;
  merged_into_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface EntityMention {
  id: string;
  memory_id: string;
  entity_id: string;
  mention_text: string;
  context_snippet: string | null;
  position_start: number;
  position_end: number;
  relationship_type: string | null;
  extraction_method: string;
  confidence: number;
  created_at: Date;
}

export interface ExtractedEntity {
  name: string;
  type: EntityType;
  mentionText: string;
  positionStart: number;
  positionEnd: number;
  confidence: number;
  context?: string;
}

// =============================================================================
// EXTRACTION PATTERNS
// =============================================================================

/**
 * Regex patterns for entity extraction
 * Designed to be precise over recall - prefer fewer false positives
 */
const PATTERNS = {
  // People: Capitalized name patterns
  // Process in order - longer patterns first to prefer full names
  person: [
    // Two-word names (most common): "Sarah Chen", "John O'Brien"
    /\b([A-Z][a-z]+\s+[A-Z][a-z'-]+)\b/g,
    // Three-word names: "Mary Jane Watson"
    /\b([A-Z][a-z]+\s+[A-Z][a-z]+\s+[A-Z][a-z'-]+)\b/g,
    // Titles with names
    /\b((?:Dr|Mr|Mrs|Ms|Prof|Sir|Dame)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z'-]+)*)\b/g,
  ],

  // Projects: Explicit project references
  // "the Quantum project", "Project Alpha", "working on Nebula"
  project: [
    // "the X project" or "X project" (but not "project deadline" etc)
    /\b(?:the\s+)?([A-Z][a-zA-Z0-9]+)\s+project(?:\s|$|[,.])/gi,
    // "Project X"
    /\bProject\s+([A-Z][a-zA-Z0-9]+)\b/g,
    // "working on X"
    /\bworking on\s+(?:the\s+)?([A-Z][a-zA-Z0-9]+)\b/gi,
  ],

  // Organizations: Company patterns
  // "at Google", "Apple Inc", "the ACME Corporation"
  organization: [
    /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)\s+(?:Inc|Corp|LLC|Ltd|Co|Company|Corporation|Industries|Group|Foundation)\b/gi,
  ],

  // Places: Location patterns
  // "in New York", "at the office", "from San Francisco"
  place: [
    /\b(?:in|from|to|near)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
  ],

  // Concepts: Very conservative - only explicit markers
  concept: [
    /\b(?:the concept of|the idea of)\s+"?([A-Z][a-zA-Z\s]+)"?\b/gi,
  ],
};

// Words to exclude from entity extraction
const STOP_WORDS = new Set([
  // Common sentence starters
  'The', 'This', 'That', 'These', 'Those', 'Here', 'There', 'Where', 'When', 'What', 'Why', 'How',
  'I', 'We', 'You', 'They', 'He', 'She', 'It',
  // Time words
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December',
  'Today', 'Tomorrow', 'Yesterday',
  // Common words that get capitalized
  'Also', 'Just', 'Really', 'Very', 'Now', 'Then', 'So', 'But', 'And', 'Or',
  'First', 'Second', 'Third', 'Next', 'Last', 'New', 'Old',
  // Common false positives
  'Need', 'Met', 'CTO', 'CEO', 'CFO', 'COO', 'VP',
]);

// =============================================================================
// EXTRACTION FUNCTIONS
// =============================================================================

/**
 * Extract all entities from text using regex patterns
 */
export function extractEntities(text: string): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];
  const seen = new Set<string>(); // Dedupe by position

  for (const [type, patterns] of Object.entries(PATTERNS)) {
    for (const pattern of patterns) {
      // Reset regex state
      pattern.lastIndex = 0;

      let match;
      while ((match = pattern.exec(text)) !== null) {
        const name = match[1]?.trim();
        if (!name) continue;

        // Skip stop words
        if (STOP_WORDS.has(name)) continue;
        if (name.split(/\s+/).every((w) => STOP_WORDS.has(w))) continue;

        // Skip very short names (likely false positives)
        if (name.length < 2) continue;

        // Skip if already seen at this position
        const posKey = `${match.index}-${name}`;
        if (seen.has(posKey)) continue;
        seen.add(posKey);

        // Calculate context snippet
        const contextStart = Math.max(0, match.index - 30);
        const contextEnd = Math.min(text.length, match.index + name.length + 30);
        const context = text.slice(contextStart, contextEnd);

        entities.push({
          name,
          type: type as EntityType,
          mentionText: match[0],
          positionStart: match.index,
          positionEnd: match.index + match[0].length,
          confidence: calculateExtractionConfidence(name, type as EntityType, text),
          context,
        });
      }
    }
  }

  // Sort by position and remove overlapping extractions (prefer longer matches)
  return deduplicateEntities(entities);
}

/**
 * Calculate confidence score for an extraction
 */
function calculateExtractionConfidence(
  name: string,
  type: EntityType,
  text: string
): number {
  let confidence = 0.7; // Base confidence for regex match

  // Boost for multi-word names (more likely to be real entities)
  if (name.includes(' ')) {
    confidence += 0.1;
  }

  // Boost for names that appear multiple times
  const occurrences = (text.match(new RegExp(name, 'gi')) || []).length;
  if (occurrences > 1) {
    confidence += Math.min(0.1, occurrences * 0.02);
  }

  // Type-specific adjustments
  if (type === 'person' && /^[A-Z][a-z]+\s+[A-Z][a-z]+$/.test(name)) {
    confidence += 0.1; // Two-word proper names are likely people
  }

  if (type === 'project' && text.toLowerCase().includes('project')) {
    confidence += 0.05; // Explicit project mention
  }

  return Math.min(1.0, confidence);
}

/**
 * Remove overlapping extractions, preferring longer/higher confidence matches
 */
function deduplicateEntities(entities: ExtractedEntity[]): ExtractedEntity[] {
  if (entities.length === 0) return entities;

  // Sort by position, then by length (longer first)
  entities.sort((a, b) => {
    if (a.positionStart !== b.positionStart) {
      return a.positionStart - b.positionStart;
    }
    return b.name.length - a.name.length;
  });

  const result: ExtractedEntity[] = [];
  let lastEnd = -1;

  for (const entity of entities) {
    // Skip if overlaps with previous (already accepted longer match)
    if (entity.positionStart < lastEnd) continue;

    result.push(entity);
    lastEnd = entity.positionEnd;
  }

  return result;
}

// =============================================================================
// DATABASE OPERATIONS
// =============================================================================

/**
 * Normalize entity name to canonical form
 */
function canonicalize(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Get or create an entity, handling deduplication
 */
export async function getOrCreateEntity(
  extracted: ExtractedEntity
): Promise<Entity> {
  const canonical = canonicalize(extracted.name);

  // Check if entity already exists
  const existing = await pool.query(
    `SELECT * FROM entities
     WHERE canonical_name = $1 AND entity_type = $2
     AND is_merged = FALSE`,
    [canonical, extracted.type]
  );

  if (existing.rows.length > 0) {
    // Update last_seen and mention_count
    const updated = await pool.query(
      `UPDATE entities
       SET last_seen_at = NOW(),
           mention_count = mention_count + 1,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [existing.rows[0].id]
    );
    return updated.rows[0] as Entity;
  }

  // Create new entity with embedding
  let embeddingStr: string | null = null;
  try {
    const embedding = await generateEmbedding(extracted.name);
    embeddingStr = `[${embedding.join(',')}]`;
  } catch {
    // Embedding optional - continue without it
  }

  const result = await pool.query(
    `INSERT INTO entities (
      name, canonical_name, entity_type, embedding,
      extraction_method, confidence
    )
    VALUES ($1, $2, $3, $4, 'regex', $5)
    RETURNING *`,
    [extracted.name, canonical, extracted.type, embeddingStr, extracted.confidence]
  );

  return result.rows[0] as Entity;
}

/**
 * Create a mention link between a memory and an entity
 */
export async function createMention(
  memoryId: string,
  entityId: string,
  extracted: ExtractedEntity
): Promise<EntityMention> {
  // Check if mention already exists at this position
  const existing = await pool.query(
    `SELECT * FROM entity_mentions
     WHERE memory_id = $1 AND entity_id = $2 AND position_start = $3`,
    [memoryId, entityId, extracted.positionStart]
  );

  if (existing.rows.length > 0) {
    return existing.rows[0] as EntityMention;
  }

  const result = await pool.query(
    `INSERT INTO entity_mentions (
      memory_id, entity_id, mention_text, context_snippet,
      position_start, position_end, extraction_method, confidence
    )
    VALUES ($1, $2, $3, $4, $5, $6, 'regex', $7)
    RETURNING *`,
    [
      memoryId,
      entityId,
      extracted.mentionText,
      extracted.context,
      extracted.positionStart,
      extracted.positionEnd,
      extracted.confidence,
    ]
  );

  return result.rows[0] as EntityMention;
}

/**
 * Extract entities from memory content and create all necessary records
 */
export async function extractAndStoreEntities(
  memoryId: string,
  content: string
): Promise<{ entities: Entity[]; mentions: EntityMention[] }> {
  const extracted = extractEntities(content);
  const entities: Entity[] = [];
  const mentions: EntityMention[] = [];

  for (const ext of extracted) {
    const entity = await getOrCreateEntity(ext);
    entities.push(entity);

    const mention = await createMention(memoryId, entity.id, ext);
    mentions.push(mention);
  }

  return { entities, mentions };
}

// =============================================================================
// QUERY FUNCTIONS
// =============================================================================

export interface ListEntitiesOptions {
  type?: EntityType;
  limit?: number;
  offset?: number;
  search?: string;
}

/**
 * List all entities with optional filtering
 */
export async function listEntities(
  options: ListEntitiesOptions = {}
): Promise<Entity[]> {
  const { type, limit = 50, offset = 0, search } = options;

  let query = `
    SELECT * FROM entities
    WHERE is_merged = FALSE
  `;
  const params: (string | number)[] = [];
  let paramIndex = 1;

  if (type) {
    query += ` AND entity_type = $${paramIndex}`;
    params.push(type);
    paramIndex++;
  }

  if (search) {
    query += ` AND (name ILIKE $${paramIndex} OR canonical_name ILIKE $${paramIndex})`;
    params.push(`%${search}%`);
    paramIndex++;
  }

  query += ` ORDER BY mention_count DESC, last_seen_at DESC`;
  query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);

  const result = await pool.query(query, params);
  return result.rows as Entity[];
}

/**
 * Get an entity by ID
 */
export async function getEntity(id: string): Promise<Entity | null> {
  const result = await pool.query(
    `SELECT * FROM entities WHERE id = $1 AND is_merged = FALSE`,
    [id]
  );
  return (result.rows[0] as Entity) ?? null;
}

/**
 * Search for entities by name (fuzzy match)
 */
export async function searchEntities(
  query: string,
  type?: EntityType
): Promise<Entity[]> {
  const canonical = canonicalize(query);

  let sql = `
    SELECT * FROM entities
    WHERE is_merged = FALSE
      AND (
        canonical_name ILIKE $1
        OR name ILIKE $1
        OR $2 = ANY(aliases)
      )
  `;
  const params: (string | EntityType | undefined)[] = [`%${canonical}%`, query];

  if (type) {
    sql += ` AND entity_type = $3`;
    params.push(type);
  }

  sql += ` ORDER BY mention_count DESC LIMIT 20`;

  const result = await pool.query(sql, params);
  return result.rows as Entity[];
}

export interface EntityWithMemories extends Entity {
  memories: Array<{
    id: string;
    content: string;
    created_at: Date;
    salience_score: number;
    mention_text: string;
  }>;
}

/**
 * Get all information about an entity including related memories
 * This is the "What do I know about X?" query
 */
export async function getEntityWithMemories(
  entityId: string
): Promise<EntityWithMemories | null> {
  // Get the entity
  const entity = await getEntity(entityId);
  if (!entity) return null;

  // Get all memories that mention this entity
  const memoriesResult = await pool.query(
    `SELECT m.id, m.content, m.created_at, m.salience_score, em.mention_text
     FROM memories m
     JOIN entity_mentions em ON em.memory_id = m.id
     WHERE em.entity_id = $1
     ORDER BY m.created_at DESC
     LIMIT 50`,
    [entityId]
  );

  return {
    ...entity,
    memories: memoriesResult.rows,
  };
}

/**
 * Find entity by name query (for CLI "who" command)
 * Searches across all entities and returns best match with memories
 */
export async function findEntityByName(
  nameQuery: string
): Promise<EntityWithMemories | null> {
  const entities = await searchEntities(nameQuery);
  const first = entities[0];
  if (!first) return null;

  // Return first match (highest mention count)
  return getEntityWithMemories(first.id);
}

/**
 * Get entities mentioned in a specific memory
 */
export async function getMemoryEntities(memoryId: string): Promise<Entity[]> {
  const result = await pool.query(
    `SELECT e.* FROM entities e
     JOIN entity_mentions em ON em.entity_id = e.id
     WHERE em.memory_id = $1 AND e.is_merged = FALSE
     ORDER BY e.entity_type, e.name`,
    [memoryId]
  );
  return result.rows as Entity[];
}

/**
 * Count entities by type
 */
export async function countEntitiesByType(): Promise<Record<EntityType, number>> {
  const result = await pool.query(
    `SELECT entity_type, COUNT(*) as count
     FROM entities
     WHERE is_merged = FALSE
     GROUP BY entity_type`
  );

  const counts: Record<string, number> = {
    person: 0,
    project: 0,
    concept: 0,
    place: 0,
    organization: 0,
  };

  for (const row of result.rows) {
    counts[row.entity_type] = parseInt(row.count, 10);
  }

  return counts as Record<EntityType, number>;
}

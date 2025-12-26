/**
 * Context Service (Slice 3)
 *
 * Production-quality context injection with:
 * - Context profiles (general, work, personal, creative)
 * - Full scoring function: salience × relevance × recency × strength
 * - Token budgeting with percentage caps
 * - Disclosure logging for audit trail
 */

import { pool } from '../db/pool.js';
import { generateEmbedding } from '../providers/embeddings.js';

// === TYPES ===

export interface ContextProfile {
  id: string;
  name: string;
  description: string | null;
  include_sources: string[];
  min_salience: number;
  min_strength: number;
  recency_weight: number;
  lookback_days: number;
  max_tokens: number;
  format: 'markdown' | 'json' | 'plain';
  scoring_weights: ScoringWeights;
  budget_caps: BudgetCaps;
  is_default: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ScoringWeights {
  salience: number;
  relevance: number;
  recency: number;
  strength: number;
}

export interface BudgetCaps {
  high_salience: number;
  relevant: number;
  recent: number;
}

export interface ScoredMemory {
  id: string;
  content: string;
  created_at: Date;
  salience_score: number;
  current_strength: number;
  similarity?: number;
  recency_score: number;
  final_score: number;
  token_estimate: number;
  category: 'high_salience' | 'relevant' | 'recent';
}

export interface ContextPackage {
  generated_at: string;
  profile: string;
  query?: string;
  memories: ScoredMemory[];
  token_count: number;
  disclosure_id: string;
  markdown: string;
  json: object;
}

export interface GenerateContextOptions {
  profile?: string;
  query?: string;
  maxTokens?: number;
  conversationId?: string;
}

// === PROFILE FUNCTIONS ===

/**
 * Get a context profile by name
 */
export async function getProfile(name: string): Promise<ContextProfile | null> {
  const result = await pool.query(
    'SELECT * FROM context_profiles WHERE name = $1',
    [name]
  );
  return (result.rows[0] as ContextProfile) ?? null;
}

/**
 * Get the default context profile
 */
export async function getDefaultProfile(): Promise<ContextProfile> {
  const result = await pool.query(
    'SELECT * FROM context_profiles WHERE is_default = TRUE LIMIT 1'
  );
  if (!result.rows[0]) {
    throw new Error('No default profile found');
  }
  return result.rows[0] as ContextProfile;
}

/**
 * List all context profiles
 */
export async function listProfiles(): Promise<ContextProfile[]> {
  const result = await pool.query(
    'SELECT * FROM context_profiles ORDER BY is_default DESC, name ASC'
  );
  return result.rows as ContextProfile[];
}

// === SCORING FUNCTIONS ===

/**
 * Calculate recency score (exponential decay)
 * Score decreases as memory gets older
 */
function calculateRecencyScore(createdAt: Date, lookbackDays: number): number {
  const now = Date.now();
  const memoryTime = new Date(createdAt).getTime();
  const daysSince = (now - memoryTime) / (1000 * 60 * 60 * 24);

  // Exponential decay with half-life based on lookback days
  // At lookbackDays, score is ~0.5
  const halfLife = lookbackDays / 2;
  const score = Math.exp(-daysSince / halfLife);

  return Math.max(0, Math.min(1, score));
}

/**
 * Estimate tokens for a piece of text
 * Rough estimate: ~4 characters per token for English
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Calculate final score for a memory
 */
function calculateFinalScore(
  memory: {
    salience_score: number;
    current_strength: number;
    created_at: Date;
    similarity?: number;
  },
  weights: ScoringWeights,
  lookbackDays: number
): number {
  const normalizedSalience = memory.salience_score / 10;
  const normalizedStrength = memory.current_strength;
  const recencyScore = calculateRecencyScore(memory.created_at, lookbackDays);
  const relevanceScore = memory.similarity ?? 0.5; // Default if no query

  const score =
    weights.salience * normalizedSalience +
    weights.relevance * relevanceScore +
    weights.recency * recencyScore +
    weights.strength * normalizedStrength;

  return Math.max(0, Math.min(1, score));
}

// === TOKEN BUDGETING ===

/**
 * Apply token budget to memories
 * Returns memories that fit within the budget, prioritized by category
 */
function applyTokenBudget(
  memories: ScoredMemory[],
  maxTokens: number,
  budgetCaps: BudgetCaps
): ScoredMemory[] {
  const budgets = {
    high_salience: Math.floor(maxTokens * budgetCaps.high_salience),
    relevant: Math.floor(maxTokens * budgetCaps.relevant),
    recent: Math.floor(maxTokens * budgetCaps.recent),
  };

  const used = { high_salience: 0, relevant: 0, recent: 0 };
  const selected: ScoredMemory[] = [];

  // Sort by final score within each category
  const byCategory = {
    high_salience: memories
      .filter((m) => m.category === 'high_salience')
      .sort((a, b) => b.final_score - a.final_score),
    relevant: memories
      .filter((m) => m.category === 'relevant')
      .sort((a, b) => b.final_score - a.final_score),
    recent: memories
      .filter((m) => m.category === 'recent')
      .sort((a, b) => b.final_score - a.final_score),
  };

  // Fill each category up to its budget
  for (const category of ['high_salience', 'relevant', 'recent'] as const) {
    for (const memory of byCategory[category]) {
      if (used[category] + memory.token_estimate <= budgets[category]) {
        selected.push(memory);
        used[category] += memory.token_estimate;
      }
    }
  }

  // Sort final selection by score
  return selected.sort((a, b) => b.final_score - a.final_score);
}

// === DISCLOSURE LOGGING ===

/**
 * Log what was disclosed to the AI
 */
async function logDisclosure(
  profileName: string,
  query: string | undefined,
  memoryIds: string[],
  tokenCount: number,
  format: string,
  scoringWeights: ScoringWeights,
  conversationId?: string
): Promise<string> {
  const result = await pool.query(
    `INSERT INTO disclosure_log (
      conversation_id, profile_used, query_text,
      disclosed_memory_ids, disclosed_memory_count,
      scoring_weights, token_count, format
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id`,
    [
      conversationId,
      profileName,
      query,
      memoryIds,
      memoryIds.length,
      JSON.stringify(scoringWeights),
      tokenCount,
      format,
    ]
  );
  return result.rows[0]?.id as string;
}

// === FORMATTING ===

/**
 * Format memories as markdown
 */
function formatMarkdown(
  memories: ScoredMemory[],
  profile: ContextProfile,
  query?: string
): string {
  const lines: string[] = [];

  lines.push('# Memory Context');
  lines.push('');
  lines.push(`**Profile**: ${profile.name}`);
  lines.push(`**Generated**: ${new Date().toISOString()}`);
  if (query) {
    lines.push(`**Query**: "${query}"`);
  }
  lines.push('');

  if (memories.length === 0) {
    lines.push('No memories match the current criteria.');
    return lines.join('\n');
  }

  // Group by category
  const highSalience = memories.filter((m) => m.category === 'high_salience');
  const relevant = memories.filter((m) => m.category === 'relevant');
  const recent = memories.filter((m) => m.category === 'recent');

  if (highSalience.length > 0) {
    lines.push('## Important Memories');
    lines.push('');
    for (const m of highSalience) {
      const date = new Date(m.created_at).toLocaleDateString();
      const score = (m.final_score * 100).toFixed(0);
      lines.push(`- [${date}] (score: ${score}%) ${m.content}`);
    }
    lines.push('');
  }

  if (relevant.length > 0) {
    lines.push('## Relevant Memories');
    lines.push('');
    for (const m of relevant) {
      const date = new Date(m.created_at).toLocaleDateString();
      const score = (m.final_score * 100).toFixed(0);
      const sim = m.similarity ? ` | similarity: ${(m.similarity * 100).toFixed(0)}%` : '';
      lines.push(`- [${date}] (score: ${score}%${sim}) ${m.content}`);
    }
    lines.push('');
  }

  if (recent.length > 0) {
    lines.push('## Recent Memories');
    lines.push('');
    for (const m of recent) {
      const date = new Date(m.created_at).toLocaleDateString();
      const score = (m.final_score * 100).toFixed(0);
      lines.push(`- [${date}] (score: ${score}%) ${m.content}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format memories as JSON
 */
function formatJson(
  memories: ScoredMemory[],
  profile: ContextProfile,
  query?: string
): object {
  return {
    profile: profile.name,
    generated_at: new Date().toISOString(),
    query,
    scoring_weights: profile.scoring_weights,
    memories: memories.map((m) => ({
      id: m.id,
      content: m.content,
      created_at: m.created_at,
      category: m.category,
      scores: {
        salience: m.salience_score,
        strength: m.current_strength,
        recency: m.recency_score,
        similarity: m.similarity,
        final: m.final_score,
      },
      token_estimate: m.token_estimate,
    })),
  };
}

// === MAIN FUNCTION ===

/**
 * Generate context package for AI consumption
 *
 * This is the primary entry point for context injection.
 * It retrieves memories, scores them, applies token budgets,
 * formats output, and logs the disclosure.
 */
export async function generateContext(
  options: GenerateContextOptions = {}
): Promise<ContextPackage> {
  const { query, maxTokens, conversationId } = options;

  // Get profile
  let profile: ContextProfile;
  if (options.profile) {
    const found = await getProfile(options.profile);
    if (!found) {
      throw new Error(`Profile not found: ${options.profile}`);
    }
    profile = found;
  } else {
    profile = await getDefaultProfile();
  }

  const effectiveMaxTokens = maxTokens ?? profile.max_tokens;
  const weights = profile.scoring_weights as ScoringWeights;
  const budgetCaps = profile.budget_caps as BudgetCaps;

  // Generate query embedding if query provided
  let queryEmbedding: number[] | null = null;
  if (query) {
    queryEmbedding = await generateEmbedding(query);
  }

  // Fetch candidate memories
  const lookbackDate = new Date();
  lookbackDate.setDate(lookbackDate.getDate() - profile.lookback_days);

  let memoriesQuery: string;
  let queryParams: (string | number | Date)[];

  if (queryEmbedding) {
    const embeddingStr = `[${queryEmbedding.join(',')}]`;
    memoriesQuery = `
      SELECT
        id, content, created_at, salience_score, current_strength,
        1 - (embedding <=> $1::vector) as similarity
      FROM memories
      WHERE embedding IS NOT NULL
        AND salience_score >= $2
        AND current_strength >= $3
        AND created_at >= $4
      ORDER BY salience_score DESC, created_at DESC
      LIMIT 100
    `;
    queryParams = [embeddingStr, profile.min_salience, profile.min_strength, lookbackDate];
  } else {
    memoriesQuery = `
      SELECT
        id, content, created_at, salience_score, current_strength,
        NULL as similarity
      FROM memories
      WHERE salience_score >= $1
        AND current_strength >= $2
        AND created_at >= $3
      ORDER BY salience_score DESC, created_at DESC
      LIMIT 100
    `;
    queryParams = [profile.min_salience, profile.min_strength, lookbackDate];
  }

  const result = await pool.query(memoriesQuery, queryParams);

  // Score and categorize memories
  const scoredMemories: ScoredMemory[] = result.rows.map((row) => {
    const recencyScore = calculateRecencyScore(row.created_at, profile.lookback_days);
    const finalScore = calculateFinalScore(
      {
        salience_score: row.salience_score,
        current_strength: row.current_strength,
        created_at: row.created_at,
        similarity: row.similarity,
      },
      weights,
      profile.lookback_days
    );

    // Categorize based on primary characteristic
    let category: 'high_salience' | 'relevant' | 'recent';
    if (row.salience_score >= 6.0) {
      category = 'high_salience';
    } else if (row.similarity && row.similarity >= 0.5) {
      category = 'relevant';
    } else {
      category = 'recent';
    }

    return {
      id: row.id,
      content: row.content,
      created_at: row.created_at,
      salience_score: row.salience_score,
      current_strength: row.current_strength,
      similarity: row.similarity,
      recency_score: recencyScore,
      final_score: finalScore,
      token_estimate: estimateTokens(row.content),
      category,
    };
  });

  // Apply token budgeting
  const budgetedMemories = applyTokenBudget(
    scoredMemories,
    effectiveMaxTokens,
    budgetCaps
  );

  // Calculate total tokens
  const totalTokens = budgetedMemories.reduce((sum, m) => sum + m.token_estimate, 0);

  // Log disclosure
  const disclosureId = await logDisclosure(
    profile.name,
    query,
    budgetedMemories.map((m) => m.id),
    totalTokens,
    profile.format,
    weights,
    conversationId
  );

  // Format output
  const markdown = formatMarkdown(budgetedMemories, profile, query);
  const json = formatJson(budgetedMemories, profile, query);

  return {
    generated_at: new Date().toISOString(),
    profile: profile.name,
    query,
    memories: budgetedMemories,
    token_count: totalTokens,
    disclosure_id: disclosureId,
    markdown,
    json,
  };
}

/**
 * Get disclosure log entries
 */
export async function getDisclosureLog(
  limit = 20,
  conversationId?: string
): Promise<object[]> {
  let query = 'SELECT * FROM disclosure_log';
  const params: (string | number)[] = [];

  if (conversationId) {
    query += ' WHERE conversation_id = $1';
    params.push(conversationId);
    query += ' ORDER BY created_at DESC LIMIT $2';
    params.push(limit);
  } else {
    query += ' ORDER BY created_at DESC LIMIT $1';
    params.push(limit);
  }

  const result = await pool.query(query, params);
  return result.rows;
}

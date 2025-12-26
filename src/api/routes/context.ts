import { Router, Request, Response } from 'express';
import { getContextMemories, Memory, SearchResult } from '../../services/memories.js';

const router = Router();

interface ContextPackage {
  generated_at: string;
  query?: string;
  important_memories: Array<{
    id: string;
    content: string;
    created_at: Date;
    salience: number;
  }>;
  recent_memories: Array<{
    id: string;
    content: string;
    created_at: Date;
    salience: number;
  }>;
  relevant_memories: Array<{
    id: string;
    content: string;
    created_at: Date;
    salience: number;
    similarity: number;
    combined_score: number;
  }>;
  markdown: string;
}

function formatMemoryForContext(memory: Memory) {
  return {
    id: memory.id,
    content: memory.content,
    created_at: memory.created_at,
    salience: memory.salience_score,
  };
}

function formatSearchResultForContext(result: SearchResult) {
  return {
    ...formatMemoryForContext(result),
    similarity: result.similarity,
    combined_score: result.combined_score,
  };
}

function generateMarkdown(
  highSalience: Memory[],
  recent: Memory[],
  relevant: SearchResult[],
  query?: string
): string {
  const lines: string[] = [];

  lines.push('# Memory Context');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  if (query) {
    lines.push(`Query: "${query}"`);
  }
  lines.push('');

  // High-salience memories first (most important)
  if (highSalience.length > 0) {
    lines.push('## Important Memories');
    lines.push('');
    for (const memory of highSalience) {
      const date = new Date(memory.created_at).toLocaleDateString();
      const salience = memory.salience_score.toFixed(1);
      lines.push(`- [${date}] ⭐${salience} ${memory.content}`);
    }
    lines.push('');
  }

  if (relevant.length > 0) {
    lines.push('## Relevant Memories');
    lines.push('');
    for (const memory of relevant) {
      const date = new Date(memory.created_at).toLocaleDateString();
      const similarity = (memory.similarity * 100).toFixed(1);
      const salience = memory.salience_score.toFixed(1);
      lines.push(`- [${date}] ${similarity}% ⭐${salience} ${memory.content}`);
    }
    lines.push('');
  }

  if (recent.length > 0) {
    lines.push('## Recent Memories');
    lines.push('');
    for (const memory of recent) {
      const date = new Date(memory.created_at).toLocaleDateString();
      const salience = memory.salience_score.toFixed(1);
      lines.push(`- [${date}] ⭐${salience} ${memory.content}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * POST /api/context
 * Get context package for AI consumption
 *
 * Slice 2: Includes high-salience memories for priority context
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { query, limit = 10, recent_count = 5, min_salience = 0 } = req.body;

    const { recent, relevant, highSalience } = await getContextMemories(query, {
      limit,
      recentCount: recent_count,
      minSalience: min_salience,
    });

    const contextPackage: ContextPackage = {
      generated_at: new Date().toISOString(),
      query,
      important_memories: highSalience.map(formatMemoryForContext),
      recent_memories: recent.map(formatMemoryForContext),
      relevant_memories: relevant.map(formatSearchResultForContext),
      markdown: generateMarkdown(highSalience, recent, relevant, query),
    };

    res.json(contextPackage);
  } catch (error) {
    console.error('Error generating context:', error);
    res.status(500).json({ error: 'Failed to generate context' });
  }
});

/**
 * GET /api/context
 * Get context (simpler interface for CLI)
 *
 * Slice 2: Includes high-salience memories for priority context
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const query = req.query.query as string | undefined;
    const limit = parseInt(req.query.limit as string) || 10;
    const recentCount = parseInt(req.query.recent_count as string) || 5;
    const minSalience = parseFloat(req.query.min_salience as string) || 0;

    const { recent, relevant, highSalience } = await getContextMemories(query, {
      limit,
      recentCount,
      minSalience,
    });

    const contextPackage: ContextPackage = {
      generated_at: new Date().toISOString(),
      query,
      important_memories: highSalience.map(formatMemoryForContext),
      recent_memories: recent.map(formatMemoryForContext),
      relevant_memories: relevant.map(formatSearchResultForContext),
      markdown: generateMarkdown(highSalience, recent, relevant, query),
    };

    res.json(contextPackage);
  } catch (error) {
    console.error('Error generating context:', error);
    res.status(500).json({ error: 'Failed to generate context' });
  }
});

export default router;

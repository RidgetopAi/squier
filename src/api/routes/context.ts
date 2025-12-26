import { Router, Request, Response } from 'express';
import { getContextMemories, Memory, SearchResult } from '../../services/memories.js';

const router = Router();

interface ContextPackage {
  generated_at: string;
  query?: string;
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
  };
}

function generateMarkdown(
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

  if (relevant.length > 0) {
    lines.push('## Relevant Memories');
    lines.push('');
    for (const memory of relevant) {
      const date = new Date(memory.created_at).toLocaleDateString();
      lines.push(`- [${date}] (similarity: ${(memory.similarity * 100).toFixed(1)}%) ${memory.content}`);
    }
    lines.push('');
  }

  if (recent.length > 0) {
    lines.push('## Recent Memories');
    lines.push('');
    for (const memory of recent) {
      const date = new Date(memory.created_at).toLocaleDateString();
      lines.push(`- [${date}] ${memory.content}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * POST /api/context
 * Get context package for AI consumption
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { query, limit = 10, recent_count = 5 } = req.body;

    const { recent, relevant } = await getContextMemories(query, {
      limit,
      recentCount: recent_count,
    });

    const contextPackage: ContextPackage = {
      generated_at: new Date().toISOString(),
      query,
      recent_memories: recent.map(formatMemoryForContext),
      relevant_memories: relevant.map(formatSearchResultForContext),
      markdown: generateMarkdown(recent, relevant, query),
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
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const query = req.query.query as string | undefined;
    const limit = parseInt(req.query.limit as string) || 10;
    const recentCount = parseInt(req.query.recent_count as string) || 5;

    const { recent, relevant } = await getContextMemories(query, {
      limit,
      recentCount,
    });

    const contextPackage: ContextPackage = {
      generated_at: new Date().toISOString(),
      query,
      recent_memories: recent.map(formatMemoryForContext),
      relevant_memories: relevant.map(formatSearchResultForContext),
      markdown: generateMarkdown(recent, relevant, query),
    };

    res.json(contextPackage);
  } catch (error) {
    console.error('Error generating context:', error);
    res.status(500).json({ error: 'Failed to generate context' });
  }
});

export default router;

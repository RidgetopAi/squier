#!/usr/bin/env node

import { Command } from 'commander';
import { createMemory, listMemories, countMemories, searchMemories, getContextMemories } from './services/memories.js';
import { checkConnection, closePool } from './db/pool.js';
import { checkEmbeddingHealth } from './providers/embeddings.js';
import { config } from './config/index.js';

const program = new Command();

program
  .name('squier')
  .description('AI memory system - memory that knows the user')
  .version('0.1.0');

/**
 * observe - Store a new memory
 */
program
  .command('observe')
  .description('Store a new observation as a memory')
  .argument('<content>', 'The content to remember')
  .option('-s, --source <source>', 'Source of the observation', 'cli')
  .option('-t, --type <type>', 'Content type', 'text')
  .action(async (content: string, options: { source: string; type: string }) => {
    try {
      const memory = await createMemory({
        content,
        source: options.source,
        content_type: options.type,
      });

      console.log('\nMemory stored successfully!');
      console.log(`  ID: ${memory.id}`);
      console.log(`  Salience: ${memory.salience_score}`);
      console.log(`  Created: ${memory.created_at}`);
    } catch (error) {
      console.error('Failed to store memory:', error);
      process.exit(1);
    } finally {
      await closePool();
    }
  });

/**
 * list - List stored memories
 */
program
  .command('list')
  .description('List stored memories')
  .option('-l, --limit <limit>', 'Maximum number of memories to show', '10')
  .option('-s, --source <source>', 'Filter by source')
  .action(async (options: { limit: string; source?: string }) => {
    try {
      const limit = parseInt(options.limit, 10);
      const [memories, total] = await Promise.all([
        listMemories({ limit, source: options.source }),
        countMemories(),
      ]);

      if (memories.length === 0) {
        console.log('\nNo memories found.');
        console.log('Use "squier observe <content>" to store your first memory.');
      } else {
        console.log(`\nMemories (${memories.length} of ${total}):\n`);

        for (const memory of memories) {
          const date = new Date(memory.created_at).toLocaleString();
          const preview = memory.content.length > 60
            ? memory.content.substring(0, 60) + '...'
            : memory.content;

          console.log(`[${memory.id.substring(0, 8)}] ${date}`);
          console.log(`  ${preview}`);
          console.log(`  salience: ${memory.salience_score} | source: ${memory.source}`);
          console.log('');
        }
      }
    } catch (error) {
      console.error('Failed to list memories:', error);
      process.exit(1);
    } finally {
      await closePool();
    }
  });

/**
 * search - Semantic search for memories
 */
program
  .command('search')
  .description('Semantic search for memories')
  .argument('<query>', 'Search query')
  .option('-l, --limit <limit>', 'Maximum number of results', '10')
  .option('-m, --min-similarity <min>', 'Minimum similarity threshold (0-1)', '0.3')
  .action(async (query: string, options: { limit: string; minSimilarity: string }) => {
    try {
      const limit = parseInt(options.limit, 10);
      const minSimilarity = parseFloat(options.minSimilarity);

      console.log(`\nSearching for: "${query}"\n`);

      const results = await searchMemories(query, { limit, minSimilarity });

      if (results.length === 0) {
        console.log('No matching memories found.');
      } else {
        console.log(`Found ${results.length} matching memories:\n`);

        for (const memory of results) {
          const date = new Date(memory.created_at).toLocaleString();
          const similarity = (memory.similarity * 100).toFixed(1);
          const salience = memory.salience_score.toFixed(1);
          const score = (memory.combined_score * 100).toFixed(1);
          const preview = memory.content.length > 70
            ? memory.content.substring(0, 70) + '...'
            : memory.content;

          console.log(`[${memory.id.substring(0, 8)}] score: ${score}%`);
          console.log(`  ${preview}`);
          console.log(`  ${date} | similarity: ${similarity}% | salience: ${salience}`);
          console.log('');
        }
      }
    } catch (error) {
      console.error('Failed to search memories:', error);
      process.exit(1);
    } finally {
      await closePool();
    }
  });

/**
 * context - Get context package for AI
 */
program
  .command('context')
  .description('Get context package for AI consumption')
  .option('-q, --query <query>', 'Focus context on this query')
  .option('-l, --limit <limit>', 'Maximum relevant memories', '10')
  .option('-r, --recent <count>', 'Number of recent memories', '5')
  .option('--min-salience <score>', 'Minimum salience to include', '0')
  .option('--json', 'Output as JSON instead of markdown')
  .action(async (options: { query?: string; limit: string; recent: string; minSalience: string; json?: boolean }) => {
    try {
      const limit = parseInt(options.limit, 10);
      const recentCount = parseInt(options.recent, 10);
      const minSalience = parseFloat(options.minSalience);

      const { recent, relevant, highSalience } = await getContextMemories(options.query, {
        limit,
        recentCount,
        minSalience,
      });

      if (options.json) {
        console.log(JSON.stringify({
          generated_at: new Date().toISOString(),
          query: options.query,
          highSalience,
          relevant,
          recent,
        }, null, 2));
      } else {
        console.log('\n# Memory Context\n');
        console.log(`Generated: ${new Date().toISOString()}`);
        if (options.query) {
          console.log(`Query: "${options.query}"`);
        }
        console.log('');

        // High-salience memories first (most important)
        if (highSalience.length > 0) {
          console.log('## Important Memories\n');
          for (const memory of highSalience) {
            const date = new Date(memory.created_at).toLocaleDateString();
            const salience = memory.salience_score.toFixed(1);
            console.log(`- [${date}] ⭐${salience} ${memory.content}`);
          }
          console.log('');
        }

        if (relevant.length > 0) {
          console.log('## Relevant Memories\n');
          for (const memory of relevant) {
            const date = new Date(memory.created_at).toLocaleDateString();
            const similarity = (memory.similarity * 100).toFixed(1);
            const salience = memory.salience_score.toFixed(1);
            console.log(`- [${date}] ${similarity}% ⭐${salience} ${memory.content}`);
          }
          console.log('');
        }

        if (recent.length > 0) {
          console.log('## Recent Memories\n');
          for (const memory of recent) {
            const date = new Date(memory.created_at).toLocaleDateString();
            const salience = memory.salience_score.toFixed(1);
            console.log(`- [${date}] ⭐${salience} ${memory.content}`);
          }
          console.log('');
        }

        if (recent.length === 0 && relevant.length === 0 && highSalience.length === 0) {
          console.log('No memories available for context.');
          console.log('Use "squier observe <content>" to store memories.');
        }
      }
    } catch (error) {
      console.error('Failed to get context:', error);
      process.exit(1);
    } finally {
      await closePool();
    }
  });

/**
 * status - Check system health
 */
program
  .command('status')
  .description('Check system health and connection')
  .action(async () => {
    try {
      console.log('\nSquier Status\n');

      const [dbConnected, embeddingConnected] = await Promise.all([
        checkConnection(),
        checkEmbeddingHealth(),
      ]);

      console.log(`  Database: ${dbConnected ? 'Connected' : 'Disconnected'}`);
      console.log(`  Embedding: ${embeddingConnected ? 'Connected' : 'Disconnected'}`);
      console.log(`    Provider: ${config.embedding.provider}`);
      console.log(`    Model: ${config.embedding.model}`);
      console.log(`    Dimension: ${config.embedding.dimension}`);

      if (dbConnected) {
        const total = await countMemories();
        console.log(`  Memories: ${total}`);
      }

      console.log('');
    } catch (error) {
      console.error('Failed to check status:', error);
      process.exit(1);
    } finally {
      await closePool();
    }
  });

program.parse();

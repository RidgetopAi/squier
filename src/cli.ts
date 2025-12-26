#!/usr/bin/env node

import { Command } from 'commander';
import { createMemory, listMemories, countMemories, searchMemories, getMemory } from './services/memories.js';
import { generateContext, listProfiles } from './services/context.js';
import {
  listEntities,
  findEntityByName,
  countEntitiesByType,
  EntityType,
} from './services/entities.js';
import { consolidateAll, getConsolidationStats } from './services/consolidation.js';
import { getRelatedMemories, getEdgeStats } from './services/edges.js';
import { checkConnection, closePool } from './db/pool.js';
import { checkEmbeddingHealth } from './providers/embeddings.js';
import { checkLLMHealth, getLLMInfo } from './providers/llm.js';
import { config } from './config/index.js';

const program = new Command();

program
  .name('squire')
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
      const { memory, entities } = await createMemory({
        content,
        source: options.source,
        content_type: options.type,
      });

      console.log('\nMemory stored successfully!');
      console.log(`  ID: ${memory.id}`);
      console.log(`  Salience: ${memory.salience_score}`);
      console.log(`  Created: ${memory.created_at}`);

      if (entities.length > 0) {
        const entityList = entities.map((e) => `${e.name} (${e.entity_type})`).join(', ');
        console.log(`  Entities: ${entityList}`);
      }
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
        console.log('Use "squire observe <content>" to store your first memory.');
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
 * context - Get context package for AI (Slice 3)
 */
program
  .command('context')
  .description('Get context package for AI consumption')
  .option('-p, --profile <name>', 'Context profile (general, work, personal, creative)')
  .option('-q, --query <query>', 'Focus context on this query')
  .option('-t, --max-tokens <tokens>', 'Maximum tokens in output')
  .option('--json', 'Output as JSON instead of markdown')
  .action(async (options: { profile?: string; query?: string; maxTokens?: string; json?: boolean }) => {
    try {
      const maxTokens = options.maxTokens ? parseInt(options.maxTokens, 10) : undefined;

      const contextPackage = await generateContext({
        profile: options.profile,
        query: options.query,
        maxTokens,
      });

      if (options.json) {
        console.log(JSON.stringify(contextPackage.json, null, 2));
      } else {
        console.log('');
        console.log(contextPackage.markdown);
        console.log(`---`);
        console.log(`Tokens: ~${contextPackage.token_count} | Memories: ${contextPackage.memories.length} | Disclosure: ${contextPackage.disclosure_id.substring(0, 8)}`);
        console.log('');
      }
    } catch (error) {
      console.error('Failed to get context:', error);
      process.exit(1);
    } finally {
      await closePool();
    }
  });

/**
 * profiles - List available context profiles
 */
program
  .command('profiles')
  .description('List available context profiles')
  .action(async () => {
    try {
      const profiles = await listProfiles();

      console.log('\nContext Profiles:\n');

      for (const profile of profiles) {
        const defaultTag = profile.is_default ? ' (default)' : '';
        const weights = profile.scoring_weights as { salience: number; relevance: number; recency: number; strength: number };

        console.log(`  ${profile.name}${defaultTag}`);
        console.log(`    ${profile.description || 'No description'}`);
        console.log(`    min_salience: ${profile.min_salience} | max_tokens: ${profile.max_tokens}`);
        console.log(`    weights: sal=${weights.salience} rel=${weights.relevance} rec=${weights.recency} str=${weights.strength}`);
        console.log('');
      }
    } catch (error) {
      console.error('Failed to list profiles:', error);
      process.exit(1);
    } finally {
      await closePool();
    }
  });

/**
 * entities - List extracted entities
 */
program
  .command('entities')
  .description('List extracted entities (people, projects, etc.)')
  .option('-t, --type <type>', 'Filter by type (person, project, concept, place, organization)')
  .option('-l, --limit <limit>', 'Maximum number to show', '20')
  .option('-s, --search <query>', 'Search by name')
  .action(async (options: { type?: string; limit: string; search?: string }) => {
    try {
      const limit = parseInt(options.limit, 10);
      const type = options.type as EntityType | undefined;

      const [entities, counts] = await Promise.all([
        listEntities({ type, limit, search: options.search }),
        countEntitiesByType(),
      ]);

      const totalCount = Object.values(counts).reduce((a, b) => a + b, 0);

      console.log('\nEntities\n');
      console.log(`  Total: ${totalCount}`);
      console.log(`  By type: person=${counts.person} project=${counts.project} place=${counts.place} org=${counts.organization} concept=${counts.concept}`);
      console.log('');

      if (entities.length === 0) {
        console.log('  No entities found.');
        console.log('  Entities are extracted automatically when you observe memories.');
      } else {
        for (const entity of entities) {
          const lastSeen = new Date(entity.last_seen_at).toLocaleDateString();
          console.log(`  [${entity.entity_type}] ${entity.name}`);
          console.log(`    mentions: ${entity.mention_count} | last seen: ${lastSeen}`);
          console.log('');
        }
      }
    } catch (error) {
      console.error('Failed to list entities:', error);
      process.exit(1);
    } finally {
      await closePool();
    }
  });

/**
 * who - Query everything about a person/entity
 */
program
  .command('who')
  .description('What do I know about a person or entity?')
  .argument('<name>', 'Name to search for')
  .action(async (name: string) => {
    try {
      const result = await findEntityByName(name);

      if (!result) {
        console.log(`\nNo entity found matching "${name}"`);
        console.log('Try `squire entities` to see all known entities.');
        return;
      }

      console.log(`\n${result.name}`);
      console.log(`  Type: ${result.entity_type}`);
      console.log(`  Mentions: ${result.mention_count}`);
      console.log(`  First seen: ${new Date(result.first_seen_at).toLocaleDateString()}`);
      console.log(`  Last seen: ${new Date(result.last_seen_at).toLocaleDateString()}`);

      if (result.memories.length > 0) {
        console.log('\nRelated Memories:\n');

        for (const mem of result.memories.slice(0, 10)) {
          const date = new Date(mem.created_at).toLocaleDateString();
          const preview = mem.content.length > 70
            ? mem.content.substring(0, 70) + '...'
            : mem.content;

          console.log(`  [${mem.id.substring(0, 8)}] ${date}`);
          console.log(`    ${preview}`);
          console.log(`    salience: ${mem.salience_score}`);
          console.log('');
        }

        if (result.memories.length > 10) {
          console.log(`  ... and ${result.memories.length - 10} more memories`);
        }
      }
    } catch (error) {
      console.error('Failed to query entity:', error);
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
      console.log('\nSquire Status\n');

      const [dbConnected, embeddingConnected, llmConnected] = await Promise.all([
        checkConnection(),
        checkEmbeddingHealth(),
        checkLLMHealth(),
      ]);

      const llmInfo = getLLMInfo();

      console.log(`  Database: ${dbConnected ? 'Connected' : 'Disconnected'}`);
      console.log(`  Embedding: ${embeddingConnected ? 'Connected' : 'Disconnected'}`);
      console.log(`    Provider: ${config.embedding.provider}`);
      console.log(`    Model: ${config.embedding.model}`);
      console.log(`    Dimension: ${config.embedding.dimension}`);
      console.log(`  LLM: ${llmConnected ? 'Connected' : 'Disconnected'}`);
      console.log(`    Provider: ${llmInfo.provider}`);
      console.log(`    Model: ${llmInfo.model}`);
      console.log(`    Configured: ${llmInfo.configured ? 'Yes' : 'No (set GROQ_API_KEY)'}`);

      if (dbConnected) {
        const [total, entityCounts, consolidationStats, edgeStats] = await Promise.all([
          countMemories(),
          countEntitiesByType(),
          getConsolidationStats(),
          getEdgeStats(),
        ]);
        const entityTotal = Object.values(entityCounts).reduce((a, b) => a + b, 0);
        console.log(`  Memories: ${total} (${consolidationStats.activeMemories} active, ${consolidationStats.dormantMemories} dormant)`);
        console.log(`  Entities: ${entityTotal}`);
        console.log(`  Edges: ${edgeStats.total} SIMILAR connections`);
      }

      console.log('');
    } catch (error) {
      console.error('Failed to check status:', error);
      process.exit(1);
    } finally {
      await closePool();
    }
  });

/**
 * consolidate - Run memory consolidation (decay, strengthen, edges)
 */
program
  .command('consolidate')
  .description('Run memory consolidation (decay, strengthen, form connections)')
  .option('-v, --verbose', 'Show detailed output')
  .action(async (options: { verbose?: boolean }) => {
    try {
      console.log('\nRunning consolidation...\n');

      const result = await consolidateAll();

      console.log('Consolidation complete!');
      console.log(`  Memories processed: ${result.memoriesProcessed}`);
      console.log(`  Decayed: ${result.memoriesDecayed}`);
      console.log(`  Strengthened: ${result.memoriesStrengthened}`);
      console.log(`  Edges created: ${result.edgesCreated}`);
      console.log(`  Edges reinforced: ${result.edgesReinforced}`);
      console.log(`  Edges pruned: ${result.edgesPruned}`);
      console.log(`  Duration: ${result.durationMs}ms`);

      if (options.verbose) {
        const stats = await getConsolidationStats();
        console.log('\nCurrent State:');
        console.log(`  Active memories: ${stats.activeMemories}`);
        console.log(`  Dormant memories: ${stats.dormantMemories}`);
        console.log(`  Total edges: ${stats.totalEdges}`);
        console.log(`  Average edge weight: ${stats.averageWeight.toFixed(2)}`);
      }

      console.log('');
    } catch (error) {
      console.error('Consolidation failed:', error);
      process.exit(1);
    } finally {
      await closePool();
    }
  });

/**
 * sleep - Friendly alias for consolidate
 */
program
  .command('sleep')
  .description('Let Squire consolidate memories (alias for consolidate)')
  .option('-v, --verbose', 'Show detailed output')
  .action(async (options: { verbose?: boolean }) => {
    try {
      console.log('\nSquire is sleeping... consolidating memories...\n');

      const result = await consolidateAll();

      console.log('Squire wakes up refreshed!');
      console.log(`  Processed ${result.memoriesProcessed} memories`);
      console.log(`  ${result.memoriesDecayed} faded, ${result.memoriesStrengthened} strengthened`);
      console.log(`  ${result.edgesCreated} new connections formed`);

      if (options.verbose) {
        console.log(`  ${result.edgesReinforced} connections reinforced`);
        console.log(`  ${result.edgesPruned} weak connections pruned`);
      }

      console.log('');
    } catch (error) {
      console.error('Sleep failed:', error);
      process.exit(1);
    } finally {
      await closePool();
    }
  });

/**
 * related - Show memories connected via SIMILAR edges
 */
program
  .command('related')
  .description('Show memories connected to a given memory')
  .argument('<memory-id>', 'Memory ID (can be partial)')
  .option('-l, --limit <limit>', 'Maximum number of related memories', '10')
  .action(async (memoryId: string, options: { limit: string }) => {
    try {
      const limit = parseInt(options.limit, 10);

      // Allow partial IDs - find the full ID
      let fullId = memoryId;
      if (memoryId.length < 36) {
        const memory = await getMemory(memoryId);
        if (!memory) {
          // Try to find by prefix
          console.log(`\nLooking for memory starting with "${memoryId}"...`);
          console.log('Use `squire list` to see available memories.');
          return;
        }
        fullId = memory.id;
      }

      const memory = await getMemory(fullId);
      if (!memory) {
        console.log(`\nMemory not found: ${memoryId}`);
        return;
      }

      console.log(`\nMemory: ${memory.id.substring(0, 8)}`);
      console.log(`  ${memory.content.length > 60 ? memory.content.substring(0, 60) + '...' : memory.content}`);
      console.log(`  salience: ${memory.salience_score} | strength: ${memory.current_strength.toFixed(2)}`);

      const related = await getRelatedMemories(fullId, { limit });

      if (related.length === 0) {
        console.log('\nNo connected memories found.');
        console.log('Run `squire consolidate` to form connections between similar memories.');
      } else {
        console.log(`\nConnected Memories (${related.length}):\n`);

        for (const mem of related) {
          const preview = mem.content.length > 60
            ? mem.content.substring(0, 60) + '...'
            : mem.content;
          const similarity = mem.edge_similarity ? (mem.edge_similarity * 100).toFixed(0) : '?';

          console.log(`  [${mem.id.substring(0, 8)}] weight: ${mem.edge_weight.toFixed(2)} | similarity: ${similarity}%`);
          console.log(`    ${preview}`);
          console.log('');
        }
      }
    } catch (error) {
      console.error('Failed to get related memories:', error);
      process.exit(1);
    } finally {
      await closePool();
    }
  });

program.parse();

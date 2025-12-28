/**
 * Chat Extraction Service
 *
 * Extracts memories from chat conversations during consolidation.
 * Analyzes user messages to identify facts, decisions, goals, and preferences
 * worth remembering long-term.
 */

import { pool } from '../db/pool.js';
import { complete, type LLMMessage } from '../providers/llm.js';
import { createMemory } from './memories.js';
import { processMemoryForBeliefs } from './beliefs.js';
import { classifyMemoryCategories, linkMemoryToCategories } from './summaries.js';

// === TYPES ===

export interface ExtractedMemory {
  content: string;
  type: 'fact' | 'decision' | 'goal' | 'event' | 'preference';
  salience_hint: number;
}

export interface ConversationForExtraction {
  id: string;
  client_id: string | null;
  message_count: number;
  created_at: Date;
}

export interface PendingMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  sequence_number: number;
  created_at: Date;
}

export interface ExtractionResult {
  conversationsProcessed: number;
  messagesProcessed: number;
  memoriesCreated: number;
  beliefsCreated: number;
  beliefsReinforced: number;
  skippedEmpty: number;
  errors: string[];
}

// === EXTRACTION PROMPT ===

const EXTRACTION_SYSTEM_PROMPT = `You are analyzing a conversation to extract memorable information about the user.

Your job is to identify information worth remembering long-term:
- Facts about the user (name, job, relationships, interests, location)
- Decisions or commitments they've made
- Goals or aspirations they've mentioned
- Important events they've discussed
- Preferences they've expressed

Skip:
- Greetings and small talk ("hello", "thanks", "bye")
- Meta-conversation about the AI/chat itself
- Questions without meaningful context
- Repeated information (only extract once)

Return a JSON array of memories to extract. Each memory should be a clear, standalone statement.

Example input:
User: I've been working on this AI memory project called Squire for about 2 months now
User: My wife Sarah thinks I spend too much time coding
User: I really want to ship this by January

Example output:
[
  {"content": "Brian has been working on an AI memory project called Squire for approximately 2 months", "type": "fact", "salience_hint": 7},
  {"content": "Brian's wife is named Sarah", "type": "fact", "salience_hint": 6},
  {"content": "Sarah thinks Brian spends too much time coding", "type": "fact", "salience_hint": 5},
  {"content": "Brian wants to ship Squire by January", "type": "goal", "salience_hint": 8}
]

If there's nothing worth remembering, return: []

IMPORTANT: Return ONLY valid JSON array, no markdown, no explanation.`;

// === CORE FUNCTIONS ===

/**
 * Get conversations with pending (unextracted) messages
 */
export async function getPendingConversations(): Promise<ConversationForExtraction[]> {
  const result = await pool.query<ConversationForExtraction>(`
    SELECT DISTINCT c.id, c.client_id, c.message_count, c.created_at
    FROM conversations c
    JOIN chat_messages cm ON cm.conversation_id = c.id
    WHERE cm.extraction_status = 'pending'
      AND cm.role = 'user'  -- Only consider user messages
      AND c.status = 'active'
    ORDER BY c.created_at DESC
  `);

  return result.rows;
}

/**
 * Get pending user messages for a conversation
 */
export async function getPendingMessages(
  conversationId: string
): Promise<PendingMessage[]> {
  const result = await pool.query<PendingMessage>(`
    SELECT id, conversation_id, role, content, sequence_number, created_at
    FROM chat_messages
    WHERE conversation_id = $1
      AND extraction_status = 'pending'
      AND role = 'user'
    ORDER BY sequence_number ASC
  `, [conversationId]);

  return result.rows;
}

/**
 * Build a transcript from messages for LLM analysis
 */
function buildTranscript(messages: PendingMessage[]): string {
  return messages
    .map((m) => `User: ${m.content}`)
    .join('\n');
}

/**
 * Call LLM to extract memories from transcript
 */
async function extractFromTranscript(
  transcript: string
): Promise<ExtractedMemory[]> {
  if (!transcript.trim()) {
    return [];
  }

  const messages: LLMMessage[] = [
    { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
    { role: 'user', content: transcript },
  ];

  try {
    const result = await complete(messages, {
      temperature: 0.2, // Low temperature for consistent extraction
      maxTokens: 2000,
    });

    // Parse JSON response
    const content = result.content.trim();

    // Handle empty response
    if (!content || content === '[]') {
      return [];
    }

    // Try to extract JSON from response (in case of markdown wrapping)
    let jsonStr = content;
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    const parsed = JSON.parse(jsonStr) as ExtractedMemory[];

    // Validate and filter
    return parsed.filter((m) =>
      m.content &&
      typeof m.content === 'string' &&
      m.content.length > 5 &&
      m.salience_hint >= 1 &&
      m.salience_hint <= 10
    );
  } catch (error) {
    console.error('[ChatExtraction] Failed to parse LLM response:', error);
    return [];
  }
}

/**
 * Mark messages as extracted
 */
export async function markMessagesExtracted(
  conversationId: string,
  messageIds: string[]
): Promise<void> {
  if (messageIds.length === 0) return;

  await pool.query(`
    UPDATE chat_messages
    SET extraction_status = 'extracted',
        extracted_at = NOW()
    WHERE conversation_id = $1
      AND id = ANY($2)
  `, [conversationId, messageIds]);
}

/**
 * Mark messages as skipped (nothing to extract)
 */
export async function markMessagesSkipped(
  conversationId: string,
  messageIds: string[]
): Promise<void> {
  if (messageIds.length === 0) return;

  await pool.query(`
    UPDATE chat_messages
    SET extraction_status = 'skipped',
        extracted_at = NOW()
    WHERE conversation_id = $1
      AND id = ANY($2)
  `, [conversationId, messageIds]);
}

/**
 * Extract memories from a single conversation
 */
async function extractFromConversation(
  conversation: ConversationForExtraction
): Promise<{
  memoriesCreated: number;
  beliefsCreated: number;
  beliefsReinforced: number;
  messagesProcessed: number;
  skipped: boolean;
  error?: string;
}> {
  const messages = await getPendingMessages(conversation.id);

  if (messages.length === 0) {
    return {
      memoriesCreated: 0,
      beliefsCreated: 0,
      beliefsReinforced: 0,
      messagesProcessed: 0,
      skipped: true,
    };
  }

  const messageIds = messages.map((m) => m.id);
  const transcript = buildTranscript(messages);

  try {
    // Extract memories via LLM
    const extracted = await extractFromTranscript(transcript);

    if (extracted.length === 0) {
      // Nothing worth remembering - mark as skipped
      await markMessagesSkipped(conversation.id, messageIds);
      return {
        memoriesCreated: 0,
        beliefsCreated: 0,
        beliefsReinforced: 0,
        messagesProcessed: messages.length,
        skipped: true,
      };
    }

    let memoriesCreated = 0;
    let beliefsCreated = 0;
    let beliefsReinforced = 0;

    // Create memories from extracted content
    for (const mem of extracted) {
      try {
        // Create the memory
        const { memory } = await createMemory({
          content: mem.content,
          source: 'chat',
          source_metadata: {
            conversation_id: conversation.id,
            extraction_type: mem.type,
            salience_hint: mem.salience_hint,
          },
        });

        memoriesCreated++;

        // Classify memory for living summaries
        try {
          const classifications = await classifyMemoryCategories(mem.content);
          if (classifications.length > 0) {
            await linkMemoryToCategories(memory.id, classifications);
          }
        } catch (classifyError) {
          // Log but don't fail - summary classification is secondary
          console.error('[ChatExtraction] Summary classification failed:', classifyError);
        }

        // Process for beliefs (decisions, preferences often become beliefs)
        if (mem.type === 'decision' || mem.type === 'preference' || mem.type === 'goal') {
          try {
            const beliefResult = await processMemoryForBeliefs(memory.id, mem.content);
            beliefsCreated += beliefResult.created.length;
            beliefsReinforced += beliefResult.reinforced.filter((r) => r.wasReinforced).length;
          } catch (beliefError) {
            // Log but don't fail - beliefs are secondary
            console.error('[ChatExtraction] Belief extraction failed:', beliefError);
          }
        }
      } catch (memError) {
        console.error('[ChatExtraction] Failed to create memory:', memError);
      }
    }

    // Mark messages as extracted
    await markMessagesExtracted(conversation.id, messageIds);

    return {
      memoriesCreated,
      beliefsCreated,
      beliefsReinforced,
      messagesProcessed: messages.length,
      skipped: false,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[ChatExtraction] Error processing conversation ${conversation.id}:`, error);

    return {
      memoriesCreated: 0,
      beliefsCreated: 0,
      beliefsReinforced: 0,
      messagesProcessed: 0,
      skipped: false,
      error: errorMsg,
    };
  }
}

/**
 * Main extraction function - processes all pending conversations
 * Called during consolidation
 */
export async function extractMemoriesFromChat(): Promise<ExtractionResult> {
  const result: ExtractionResult = {
    conversationsProcessed: 0,
    messagesProcessed: 0,
    memoriesCreated: 0,
    beliefsCreated: 0,
    beliefsReinforced: 0,
    skippedEmpty: 0,
    errors: [],
  };

  const conversations = await getPendingConversations();

  if (conversations.length === 0) {
    console.log('[ChatExtraction] No pending conversations to process');
    return result;
  }

  console.log(`[ChatExtraction] Processing ${conversations.length} conversation(s)...`);

  for (const conversation of conversations) {
    const convResult = await extractFromConversation(conversation);

    result.conversationsProcessed++;
    result.messagesProcessed += convResult.messagesProcessed;
    result.memoriesCreated += convResult.memoriesCreated;
    result.beliefsCreated += convResult.beliefsCreated;
    result.beliefsReinforced += convResult.beliefsReinforced;

    if (convResult.skipped) {
      result.skippedEmpty++;
    }

    if (convResult.error) {
      result.errors.push(`Conversation ${conversation.id}: ${convResult.error}`);
    }
  }

  console.log(
    `[ChatExtraction] Complete: ${result.memoriesCreated} memories, ` +
    `${result.beliefsCreated} beliefs created, ${result.skippedEmpty} skipped`
  );

  return result;
}

/**
 * Get extraction statistics
 */
export async function getExtractionStats(): Promise<{
  pendingMessages: number;
  extractedMessages: number;
  skippedMessages: number;
  conversationsWithPending: number;
}> {
  const result = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE extraction_status = 'pending' AND role = 'user') as pending,
      COUNT(*) FILTER (WHERE extraction_status = 'extracted' AND role = 'user') as extracted,
      COUNT(*) FILTER (WHERE extraction_status = 'skipped' AND role = 'user') as skipped,
      COUNT(DISTINCT conversation_id) FILTER (WHERE extraction_status = 'pending' AND role = 'user') as pending_convos
    FROM chat_messages
  `);

  const row = result.rows[0];
  return {
    pendingMessages: parseInt(row.pending ?? '0', 10),
    extractedMessages: parseInt(row.extracted ?? '0', 10),
    skippedMessages: parseInt(row.skipped ?? '0', 10),
    conversationsWithPending: parseInt(row.pending_convos ?? '0', 10),
  };
}

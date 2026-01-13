/**
 * Commitment Tools
 *
 * LLM tools for managing user commitments/tasks.
 * Allows the model to list open commitments and mark them complete.
 */

import {
  listCommitments,
  resolveCommitment,
  findMatchingCommitments,
  type Commitment,
  type ResolutionType,
} from '../services/commitments.js';
import { config } from '../config/index.js';
import type { ToolHandler } from './types.js';

// =============================================================================
// HELPERS
// =============================================================================

function formatCommitment(c: Commitment) {
  const dueLabel = c.due_at
    ? c.due_at.toLocaleDateString('en-US', {
        timeZone: config.timezone,
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
    : 'No due date';

  const isOverdue = c.due_at && new Date(c.due_at) < new Date();

  return {
    id: c.id,
    title: c.title,
    description: c.description,
    status: c.status,
    due_at: c.due_at?.toISOString() ?? null,
    due_label: dueLabel,
    is_overdue: isOverdue,
    tags: c.tags,
  };
}

// =============================================================================
// LIST OPEN COMMITMENTS TOOL
// =============================================================================

interface ListOpenCommitmentsArgs {
  include_overdue?: boolean;
  limit?: number;
}

async function handleListOpenCommitments(args: ListOpenCommitmentsArgs | null): Promise<string> {
  const { limit = 20 } = args ?? {};

  try {
    const commitments = await listCommitments({
      status: ['open', 'in_progress'],
      limit,
    });

    if (commitments.length === 0) {
      return JSON.stringify({
        message: 'No open commitments or tasks',
        count: 0,
        commitments: [],
      });
    }

    const formatted = commitments.map(formatCommitment);
    const overdueCount = formatted.filter((c) => c.is_overdue).length;

    return JSON.stringify({
      count: formatted.length,
      overdue_count: overdueCount,
      usage_note: 'Use the commitment id when calling complete_commitment. You can also match by title.',
      commitments: formatted,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Failed to list commitments: ${message}`, commitments: [] });
  }
}

export const listOpenCommitmentsToolName = 'list_open_commitments';

export const listOpenCommitmentsToolDescription =
  'List the user\'s open commitments and tasks. Use this when the user asks "what do I have to do?", "what tasks are open?", "show my commitments", or when you need to find a specific commitment to mark complete.';

export const listOpenCommitmentsToolParameters = {
  type: 'object',
  properties: {
    include_overdue: {
      type: 'boolean',
      description: 'Include overdue commitments (default: true)',
    },
    limit: {
      type: 'number',
      description: 'Maximum number of commitments to return (default: 20)',
    },
  },
  required: [],
};

export const listOpenCommitmentsToolHandler: ToolHandler<ListOpenCommitmentsArgs> = handleListOpenCommitments;

// =============================================================================
// COMPLETE COMMITMENT TOOL
// =============================================================================

interface CompleteCommitmentArgs {
  commitment_id?: string;
  title_match?: string;
  resolution_type?: ResolutionType;
}

async function handleCompleteCommitment(args: CompleteCommitmentArgs | null): Promise<string> {
  const { commitment_id, title_match, resolution_type = 'completed' } = args ?? {};

  if (!commitment_id && !title_match) {
    return JSON.stringify({
      error: 'Either commitment_id or title_match is required',
      resolved: null,
    });
  }

  try {
    let targetId: string | null = null;

    // If we have a direct ID, use it
    if (commitment_id) {
      targetId = commitment_id;
    } else if (title_match) {
      // Search by title similarity
      const matches = await findMatchingCommitments(title_match, {
        limit: 3,
        minSimilarity: 0.4,
      });

      if (matches.length === 0) {
        return JSON.stringify({
          error: `No open commitment found matching "${title_match}"`,
          resolved: null,
          suggestion: 'Use list_open_commitments to see all open commitments',
        });
      }

      const bestMatch = matches[0]!;
      const secondMatch = matches[1];

      // Decide whether to use best match or ask for clarification
      // Use best match if:
      // 1. It's the only match, OR
      // 2. It's >= 60% similar (decent match), OR
      // 3. It's significantly better than second match (15%+ gap)
      const isClearWinner =
        matches.length === 1 ||
        bestMatch.similarity >= 0.6 ||
        (secondMatch && bestMatch.similarity - secondMatch.similarity >= 0.15);

      if (!isClearWinner && matches.length > 1) {
        // Matches are too close in similarity - ask for clarification
        return JSON.stringify({
          error: 'Multiple similar commitments found. Which one did you mean?',
          matches: matches.map((m) => ({
            id: m.id,
            title: m.title,
            similarity: Math.round(m.similarity * 100) + '%',
          })),
          resolved: null,
        });
      }

      // Use best match
      targetId = bestMatch.id;
    }

    if (!targetId) {
      return JSON.stringify({
        error: 'Could not determine which commitment to complete',
        resolved: null,
      });
    }

    // Resolve the commitment
    const resolved = await resolveCommitment(targetId, {
      resolution_type,
    });

    if (!resolved) {
      return JSON.stringify({
        error: `Commitment ${targetId} not found or already resolved`,
        resolved: null,
      });
    }

    return JSON.stringify({
      message: `Marked "${resolved.title}" as ${resolution_type}`,
      resolved: {
        id: resolved.id,
        title: resolved.title,
        status: resolved.status,
        resolution_type: resolved.resolution_type,
        resolved_at: resolved.resolved_at?.toISOString(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Failed to complete commitment: ${message}`, resolved: null });
  }
}

export const completeCommitmentToolName = 'complete_commitment';

export const completeCommitmentToolDescription =
  'Mark a commitment or task as complete (or canceled). Use this when the user says they finished something, completed a task, or wants to mark something done. You can specify by ID (from list_open_commitments) or by title match. Examples: "mark the dentist appointment done", "I finished that report", "cancel the meeting task".';

export const completeCommitmentToolParameters = {
  type: 'object',
  properties: {
    commitment_id: {
      type: 'string',
      description: 'The UUID of the commitment to complete (from list_open_commitments)',
    },
    title_match: {
      type: 'string',
      description: 'A phrase to match against commitment titles (used if commitment_id not provided)',
    },
    resolution_type: {
      type: 'string',
      enum: ['completed', 'canceled', 'no_longer_relevant', 'superseded'],
      description: 'How the commitment was resolved (default: completed)',
    },
  },
  required: [],
};

export const completeCommitmentToolHandler: ToolHandler<CompleteCommitmentArgs> = handleCompleteCommitment;

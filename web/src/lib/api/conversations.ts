// ============================================
// SQUIRE WEB - CONVERSATIONS API
// ============================================

import { apiGet, apiPost, apiPatch } from './client';

// === API Response Types ===

export interface ConversationResponse {
  id: string;
  client_id: string | null;
  session_id: string | null;
  title: string | null;
  status: 'active' | 'archived' | 'deleted';
  message_count: number;
  total_tokens: number;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
}

export interface MessageResponse {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  context_memory_ids: string[];
  disclosure_id: string | null;
  context_profile: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  sequence_number: number;
  created_at: string;
  extraction_status: 'pending' | 'skipped' | 'extracted';
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

// === Conversation API Functions ===

/**
 * Fetch the most recent conversation with its messages
 * Used for loading chat history on page load
 */
export async function fetchRecentConversation(): Promise<{
  conversation: ConversationResponse;
  messages: MessageResponse[];
} | null> {
  const response = await apiGet<ApiResponse<{
    conversation: ConversationResponse;
    messages: MessageResponse[];
  } | null>>('/api/chat/conversations/recent');

  return response.data;
}

/**
 * Fetch a specific conversation with its messages
 */
export async function fetchConversation(id: string): Promise<{
  conversation: ConversationResponse;
  messages: MessageResponse[];
}> {
  const response = await apiGet<ApiResponse<{
    conversation: ConversationResponse;
    messages: MessageResponse[];
  }>>(`/api/chat/conversations/${id}`);

  return response.data;
}

/**
 * Fetch list of conversations (paginated)
 */
export async function fetchConversations(options?: {
  limit?: number;
  offset?: number;
  status?: 'active' | 'archived';
}): Promise<ConversationResponse[]> {
  const response = await apiGet<ApiResponse<ConversationResponse[]>>(
    '/api/chat/conversations',
    { params: options }
  );

  return response.data;
}

/**
 * Create a new conversation
 */
export async function createConversation(input: {
  clientId?: string;
  title?: string;
}): Promise<ConversationResponse> {
  const response = await apiPost<ApiResponse<ConversationResponse>>(
    '/api/chat/conversations',
    input
  );

  return response.data;
}

/**
 * Update a conversation (title or archive)
 */
export async function updateConversation(
  id: string,
  updates: { title?: string; status?: 'archived' }
): Promise<ConversationResponse> {
  const response = await apiPatch<ApiResponse<ConversationResponse>>(
    `/api/chat/conversations/${id}`,
    updates
  );

  return response.data;
}

/**
 * Archive a conversation
 */
export async function archiveConversation(id: string): Promise<ConversationResponse> {
  return updateConversation(id, { status: 'archived' });
}

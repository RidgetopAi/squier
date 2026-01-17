// ============================================
// SQUIRE WEB - CONTEXT API CLIENT
// ============================================

import { apiPost, apiGet } from './client';
import type { ContextPackage } from '@/lib/types';

// === Request Types ===

export interface FetchContextRequest {
  query?: string;
  profile?: string;
  max_tokens?: number;
  conversation_id?: string;
}

export interface ContextProfile {
  id: string;
  name: string;
  description: string | null;
  is_default: boolean;
}

// === API Functions ===

/**
 * Fetch context package for a query
 * Uses POST for complex requests with optional query embedding
 */
export async function fetchContext(
  request: FetchContextRequest = {}
): Promise<ContextPackage> {
  return apiPost<ContextPackage>('/api/context', request);
}


/**
 * List available context profiles
 */
export async function listContextProfiles(): Promise<ContextProfile[]> {
  const response = await apiGet<{ profiles: ContextProfile[] }>(
    '/api/context/profiles'
  );
  return response.profiles;
}


'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchContext, listContextProfiles } from '@/lib/api/context';

// Query keys for caching
const contextKeys = {
  all: ['context'] as const,
  package: (query?: string, profile?: string) =>
    [...contextKeys.all, 'package', { query, profile }] as const,
  profiles: () => [...contextKeys.all, 'profiles'] as const,
};

/**
 * Hook to fetch context package for a query
 * Uses TanStack Query for caching and deduplication
 */
export function useContextPackage(
  query?: string,
  options?: {
    profile?: string;
    maxTokens?: number;
    conversationId?: string;
    enabled?: boolean;
  }
) {
  const { profile, maxTokens, conversationId, enabled = true } = options ?? {};

  return useQuery({
    queryKey: contextKeys.package(query, profile),
    queryFn: () =>
      fetchContext({
        query,
        profile,
        max_tokens: maxTokens,
        conversation_id: conversationId,
      }),
    enabled: enabled && !!query, // Only fetch when enabled and query exists
    staleTime: 60 * 1000, // Cache for 1 minute
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
  });
}


/**
 * Hook to list available context profiles
 */
export function useContextProfiles() {
  return useQuery({
    queryKey: contextKeys.profiles(),
    queryFn: listContextProfiles,
    staleTime: 5 * 60 * 1000, // Profiles don't change often
  });
}


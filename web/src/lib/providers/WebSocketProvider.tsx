'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWebSocket } from '@/lib/hooks/useWebSocket';
import { joinConversationRoom } from '@/lib/hooks/useWebSocket';
import { initWebSocketListeners, useChatStore } from '@/lib/stores/chatStore';

interface WebSocketProviderProps {
  children: ReactNode;
}

/**
 * WebSocketProvider
 *
 * Initializes the WebSocket connection and wires up:
 * - Chat streaming listeners (P6-T4)
 * - Memory/Insight notification handlers with query invalidation (P6-T5)
 *
 * Must be rendered inside QueryClientProvider.
 */
export function WebSocketProvider({ children }: WebSocketProviderProps) {
  const queryClient = useQueryClient();

  // Initialize the socket connection and get event subscription methods
  const { isConnected, onMemoryCreated, onInsightCreated } = useWebSocket();

  // Initialize chat streaming listeners
  useEffect(() => {
    const cleanup = initWebSocketListeners();
    return cleanup;
  }, []);

  // Load persisted chat history on mount
  useEffect(() => {
    useChatStore.getState().loadRecentConversation();
  }, []);

  // Handle memory:created events - invalidate memory queries (P6-T5)
  useEffect(() => {
    const unsubscribe = onMemoryCreated((payload) => {
      if (process.env.NODE_ENV === 'development') {
        console.log('[WebSocketProvider] memory:created', payload.memory.id);
      }

      // Invalidate all memory-related queries so lists refresh
      queryClient.invalidateQueries({ queryKey: ['memories'] });
    });

    return unsubscribe;
  }, [onMemoryCreated, queryClient]);

  // Handle insight:created events - invalidate insight queries (P6-T5)
  useEffect(() => {
    const unsubscribe = onInsightCreated((payload) => {
      if (process.env.NODE_ENV === 'development') {
        console.log('[WebSocketProvider] insight:created', payload.insight.id);
      }

      // Invalidate all insight-related queries so lists refresh
      queryClient.invalidateQueries({ queryKey: ['insights'] });
    });

    return unsubscribe;
  }, [onInsightCreated, queryClient]);

  // Track previous connection state to detect reconnections
  const wasConnected = useRef(false);

  // Rejoin conversation room on reconnection
  useEffect(() => {
    if (isConnected && !wasConnected.current) {
      // Just connected (initial or reconnect)
      const conversationId = useChatStore.getState().conversationId;
      if (conversationId) {
        console.log('[WebSocketProvider] Rejoining room after connect:', conversationId);
        joinConversationRoom(conversationId);
      }
    }
    wasConnected.current = isConnected;
  }, [isConnected]);

  // Log connection status in development
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[WebSocketProvider] Connected:', isConnected);
    }
  }, [isConnected]);

  return <>{children}</>;
}

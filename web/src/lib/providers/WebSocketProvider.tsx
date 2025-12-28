'use client';

import { useEffect, type ReactNode } from 'react';
import { useWebSocket } from '@/lib/hooks/useWebSocket';
import { initWebSocketListeners } from '@/lib/stores/chatStore';

interface WebSocketProviderProps {
  children: ReactNode;
}

/**
 * WebSocketProvider
 *
 * Initializes the WebSocket connection and wires up chat streaming listeners.
 * Must be rendered inside a client component tree.
 */
export function WebSocketProvider({ children }: WebSocketProviderProps) {
  // Initialize the socket connection
  const { isConnected } = useWebSocket();

  // Initialize chat streaming listeners
  useEffect(() => {
    const cleanup = initWebSocketListeners();
    return cleanup;
  }, []);

  // Log connection status in development
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[WebSocketProvider] Connected:', isConnected);
    }
  }, [isConnected]);

  return <>{children}</>;
}

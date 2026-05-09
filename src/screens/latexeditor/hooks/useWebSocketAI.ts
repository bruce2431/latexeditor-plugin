import { useCallback, useEffect, useRef, useState } from 'react';
import { LaTeXWebSocketClient } from '../lib/websocket-client';
import { AIMessage } from '../types/latex';

export function useWebSocketAI(documentId: string, initialConversationId?: string) {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>(
    initialConversationId,
  );
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const wsClientRef = useRef<LaTeXWebSocketClient | null>(null);
  const thinkingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const conversationIdRef = useRef<string | undefined>(initialConversationId);

  useEffect(() => {
    conversationIdRef.current = initialConversationId;
    setConversationId(initialConversationId);
  }, [initialConversationId]);

  useEffect(() => {
    setMessages([]);
    setIsConnected(false);
    setIsThinking(false);
    setConnectionError(null);

    const client = new LaTeXWebSocketClient(documentId, conversationIdRef.current);
    wsClientRef.current = client;

    client.onMessage('connection_established', (data) => {
      setIsConnected(true);
      setConnectionError(null);
      conversationIdRef.current = data.conversation_id;
      setConversationId(data.conversation_id);

      if (data.history && Array.isArray(data.history)) {
        const nextMessages = data.history
          .filter((msg: any) => msg.role === 'user' || msg.role === 'assistant')
          .map((msg: any) => ({
            id: `msg-${msg.timestamp}`,
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp,
          }));
        setMessages(nextMessages);
      }
    });

    client.onMessage('thinking', () => {
      setIsThinking(true);
      setConnectionError(null);
      if (thinkingTimeoutRef.current) {
        clearTimeout(thinkingTimeoutRef.current);
      }
      thinkingTimeoutRef.current = setTimeout(() => {
        setIsThinking(false);
        setMessages((prev) => [
          ...prev,
          {
            id: `timeout-${Date.now()}`,
            role: 'assistant',
            content: '[system] AI response timed out. Please retry.',
            timestamp: Date.now(),
          },
        ]);
      }, 60000);
    });

    client.onMessage('ai_chunk', (data) => {
      const chunkId = `assistant-${conversationIdRef.current ?? documentId}`;
      setMessages((prev) => {
        const lastMessage = prev[prev.length - 1];
        if (lastMessage?.role === 'assistant' && lastMessage.id === chunkId) {
          return prev.map((msg, index) =>
            index === prev.length - 1
              ? { ...msg, content: msg.content + (data.content ?? '') }
              : msg,
          );
        }

        return [
          ...prev,
          {
            id: chunkId,
            role: 'assistant',
            content: data.content ?? '',
            timestamp: Date.now(),
          },
        ];
      });
    });

    client.onMessage('ai_response', (data) => {
      setIsThinking(false);
      if (thinkingTimeoutRef.current) {
        clearTimeout(thinkingTimeoutRef.current);
      }

      const chunkId = `assistant-${conversationIdRef.current ?? documentId}`;
      setMessages((prev) => {
        const filtered = prev.filter(
          (msg) => !(msg.role === 'assistant' && msg.id === chunkId),
        );

        return [
          ...filtered,
          {
            id: `msg-${Date.now()}`,
            role: 'assistant',
            content: data.content ?? '',
            timestamp: Date.now(),
          },
        ];
      });
    });

    client.onMessage('error', (data) => {
      setIsThinking(false);
      setConnectionError(data.error ?? 'Unknown websocket error');
      if (thinkingTimeoutRef.current) {
        clearTimeout(thinkingTimeoutRef.current);
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: `[system error] ${data.error ?? 'Unknown websocket error'}`,
          timestamp: Date.now(),
        },
      ]);
    });

    client.onMessage('history', (data) => {
      const nextMessages = (data.history ?? data.messages ?? [])
        .filter((msg: any) => msg.role === 'user' || msg.role === 'assistant')
        .map((msg: any) => ({
          id: `msg-${msg.timestamp}`,
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
        }));
      setMessages(nextMessages);
    });

    client.onMessage('history_cleared', () => {
      setMessages([]);
    });

    client.onConnectionChange((connected) => {
      setIsConnected(connected);
      if (!connected) {
        setConnectionError('WebSocket disconnected, retrying...');
      } else {
        setConnectionError(null);
      }
    });

    client.connect().catch((error) => {
      setConnectionError(`Connection failed: ${error.message}`);
      setIsConnected(false);
    });

    return () => {
      if (thinkingTimeoutRef.current) {
        clearTimeout(thinkingTimeoutRef.current);
      }
      client.disconnect();
      if (wsClientRef.current === client) {
        wsClientRef.current = null;
      }
    };
  }, [documentId, initialConversationId]);

  const sendMessage = useCallback(
    (prompt: string, context: string) => {
      if (!wsClientRef.current || !isConnected) {
        setConnectionError('WebSocket is not connected.');
        return false;
      }

      const userMessage: AIMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: prompt,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMessage]);

      wsClientRef.current.sendUserMessage(prompt, context);
      return true;
    },
    [isConnected],
  );

  const clearMessages = useCallback(() => {
    wsClientRef.current?.clearHistory();
    setMessages([]);
  }, []);

  const reconnect = useCallback(() => {
    if (!wsClientRef.current) return;

    wsClientRef.current.disconnect();
    setConnectionError('Reconnecting...');
    wsClientRef.current.connect().catch((error) => {
      setConnectionError(`Reconnect failed: ${error.message}`);
    });
  }, []);

  const getHistory = useCallback(() => {
    wsClientRef.current?.getHistory();
  }, []);

  return {
    messages,
    isConnected,
    isThinking,
    conversationId,
    connectionError,
    sendMessage,
    clearMessages,
    reconnect,
    getHistory,
  };
}

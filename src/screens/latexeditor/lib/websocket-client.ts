export type WebSocketMessageType =
  | 'connection_established'
  | 'user_message'
  | 'thinking'
  | 'ai_chunk'
  | 'ai_response'
  | 'error'
  | 'history'
  | 'history_cleared'
  | 'clear_history'
  | 'get_history'
  | 'ping'
  | 'pong';

export interface WebSocketMessage {
  type: WebSocketMessageType;
  conversation_id?: string;
  document_id?: string;
  content?: string;
  context?: string;
  error?: string;
  history?: any[];
  timestamp?: number;
}

export class LaTeXWebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private readonly reconnectDelay = 1000;
  private pingInterval: NodeJS.Timeout | null = null;

  private messageHandlers = new Map<WebSocketMessageType, Array<(data: any) => void>>();
  private connectionHandlers: Array<(connected: boolean) => void> = [];
  private shouldReconnect = true;

  constructor(
    private readonly documentId: string,
    private conversationId?: string,
  ) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.shouldReconnect = true;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = new URL(`${protocol}//${window.location.hostname}:3002`);
      wsUrl.searchParams.set('document_id', this.documentId);
      if (this.conversationId) {
        wsUrl.searchParams.set('conversation_id', this.conversationId);
      }

      this.ws = new WebSocket(wsUrl.toString());

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.notifyConnectionChange(true);
        this.startPingInterval();
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          if (message.conversation_id) {
            this.conversationId = message.conversation_id;
          }
          this.handleMessage(message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      this.ws.onclose = (event) => {
        this.stopPingInterval();
        this.notifyConnectionChange(false);
        if (this.shouldReconnect) {
          this.attemptReconnect();
        }
      };

      this.ws.onerror = (error) => {
        this.stopPingInterval();
        reject(error);
      };
    });
  }

  sendMessage(type: WebSocketMessageType, data: Partial<WebSocketMessage> = {}): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('WebSocket is not connected');
      return;
    }

    const message: WebSocketMessage = {
      type,
      conversation_id: this.conversationId,
      document_id: this.documentId,
      ...data,
    };

    this.ws.send(JSON.stringify(message));
  }

  sendUserMessage(content: string, context: string): void {
    this.sendMessage('user_message', { content, context });
  }

  clearHistory(): void {
    this.sendMessage('clear_history');
  }

  getHistory(): void {
    this.sendMessage('get_history');
  }

  onMessage(type: WebSocketMessageType, handler: (data: any) => void): void {
    const handlers = this.messageHandlers.get(type) ?? [];
    handlers.push(handler);
    this.messageHandlers.set(type, handlers);
  }

  onConnectionChange(handler: (connected: boolean) => void): void {
    this.connectionHandlers.push(handler);
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.stopPingInterval();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  private handleMessage(message: WebSocketMessage): void {
    const handlers = this.messageHandlers.get(message.type);
    handlers?.forEach((handler) => handler(message));
  }

  private notifyConnectionChange(connected: boolean): void {
    this.connectionHandlers.forEach((handler) => handler(connected));
  }

  private startPingInterval(): void {
    this.stopPingInterval();
    this.pingInterval = setInterval(() => {
      if (this.isConnected()) {
        this.sendMessage('ping');
      }
    }, 30000);
  }

  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts += 1;
    const delay = this.reconnectDelay * 2 ** (this.reconnectAttempts - 1);

    setTimeout(() => {
      if (!this.shouldReconnect) return;
      if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
        this.connect().catch((error) => {
          console.error('Reconnection failed:', error);
        });
      }
    }, delay);
  }
}

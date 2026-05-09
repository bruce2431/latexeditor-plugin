export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export class LaTeXConversation {
  private messages: ConversationMessage[] = [];
  private lastActivity: number = Date.now();
  
  constructor(
    public readonly id: string,
    public readonly documentId: string
  ) {
    // 添加系统消息
    this.messages.push({
      role: 'system',
      content: `这是与 LaTeX 文档 ${documentId} 关联的对话。`,
      timestamp: Date.now()
    });
  }
  
  addMessage(role: 'user' | 'assistant', content: string): void {
    this.messages.push({
      role,
      content,
      timestamp: Date.now()
    });
    this.lastActivity = Date.now();
    
    // 限制历史长度
    if (this.messages.length > 50) {
      this.messages = this.messages.slice(-50);
    }
  }
  
  getHistory(): ConversationMessage[] {
    return [...this.messages];
  }
  
  clearHistory(): void {
    this.messages = this.messages.filter(m => m.role === 'system');
    this.lastActivity = Date.now();
  }
  
  isInactive(timeoutMs: number = 30 * 60 * 1000): boolean {
    return Date.now() - this.lastActivity > timeoutMs;
  }
}

export class LaTeXAIConversationManager {
  private conversations: Map<string, LaTeXConversation> = new Map();
  
  getOrCreateConversation(conversationId: string, documentId: string): LaTeXConversation {
    if (!this.conversations.has(conversationId)) {
      this.conversations.set(
        conversationId,
        new LaTeXConversation(conversationId, documentId)
      );
      console.log(`Created new conversation: ${conversationId} for document: ${documentId}`);
    }
    
    return this.conversations.get(conversationId)!;
  }
  
  getConversation(conversationId: string): LaTeXConversation | undefined {
    return this.conversations.get(conversationId);
  }
  
  cleanupInactiveConversations(timeoutMs: number = 60 * 60 * 1000): void {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [id, conversation] of this.conversations.entries()) {
      if (conversation.isInactive(timeoutMs)) {
        this.conversations.delete(id);
        cleanedCount++;
        console.log(`Cleaned up inactive conversation: ${id}`);
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} inactive conversations`);
    }
  }
  
  getAllConversations(): LaTeXConversation[] {
    return Array.from(this.conversations.values());
  }
  
  getStats() {
    return {
      totalConversations: this.conversations.size,
      conversations: Array.from(this.conversations.entries()).map(([id, conv]) => ({
        id,
        documentId: conv.documentId,
        messageCount: conv.getHistory().length,
        lastActivity: conv['lastActivity']
      }))
    };
  }
}
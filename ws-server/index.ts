import WebSocket from 'ws';
import { createServer } from 'http';
import { LaTeXAIConversationManager } from './conversation-manager';
import { HermesAgentAdapter } from './hermes-agent-adapter';

const server = createServer();
const wss = new WebSocket.Server({ server });
const conversationManager = new LaTeXAIConversationManager();
const agentAdapter = new HermesAgentAdapter();

// 定期清理不活跃的对话
setInterval(() => {
  conversationManager.cleanupInactiveConversations();
}, 5 * 60 * 1000); // 每5分钟清理一次

wss.on('connection', (ws, req) => {
  console.log('New WebSocket connection');
  
  // 从 URL 获取对话 ID 和文档 ID
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const documentId = url.searchParams.get('document_id');
  const conversationId = url.searchParams.get('conversation_id') || 
                        `conv-${documentId}-${Date.now()}`;
  
  if (!documentId) {
    ws.close(1008, 'Missing document_id parameter');
    return;
  }
  
  // 获取或创建对话
  const conversation = conversationManager.getOrCreateConversation(
    conversationId,
    documentId
  );
  
  // 发送连接确认
  ws.send(JSON.stringify({
    type: 'connection_established',
    conversation_id: conversationId,
    document_id: documentId,
    history: conversation.getHistory()
  }));
  
  // 处理消息
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'user_message':
          // 发送思考状态
          ws.send(JSON.stringify({
            type: 'thinking',
            timestamp: Date.now()
          }));
          
          // 获取文档上下文
          const latexContext = message.context || '';
          
          // 调用 Hermes Agent
          const response = await agentAdapter.processLaTeXRequest({
            prompt: message.content,
            context: latexContext,
            conversationHistory: conversation.getHistory(),
            documentId: documentId
          });
          
          // 流式发送响应
          if (response.stream) {
            for await (const chunk of response.stream) {
              ws.send(JSON.stringify({
                type: 'ai_chunk',
                content: chunk,
                conversation_id: conversationId
              }));
            }
          } else {
            ws.send(JSON.stringify({
              type: 'ai_response',
              content: response.content,
              conversation_id: conversationId
            }));
          }
          
          // 更新对话历史
          conversation.addMessage('user', message.content);
          conversation.addMessage('assistant', response.content);
          
          break;
          
        case 'clear_history':
          conversation.clearHistory();
          ws.send(JSON.stringify({
            type: 'history_cleared',
            conversation_id: conversationId
          }));
          break;
          
        case 'get_history':
          ws.send(JSON.stringify({
            type: 'history',
            messages: conversation.getHistory(),
            conversation_id: conversationId
          }));
          break;
          
        case 'ping':
          ws.send(JSON.stringify({
            type: 'pong',
            timestamp: Date.now()
          }));
          break;
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
      ws.send(JSON.stringify({
        type: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        conversation_id: conversationId
      }));
    }
  });
  
  ws.on('close', () => {
    console.log(`WebSocket closed for conversation ${conversationId}`);
  });
  
  ws.on('error', (error) => {
    console.error(`WebSocket error for conversation ${conversationId}:`, error);
  });
});

server.listen(3002, () => {
  console.log('WebSocket server running on ws://localhost:3002');
});

// 优雅关闭
process.on('SIGINT', () => {
  console.log('Shutting down WebSocket server...');
  wss.close(() => {
    console.log('WebSocket server closed');
    process.exit(0);
  });
});
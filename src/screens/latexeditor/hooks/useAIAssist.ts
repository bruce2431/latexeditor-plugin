import { useState, useCallback } from 'react';
import { AIMessage } from '../types/latex';
import { latexApi } from '../lib/latex-api';

export function useAIAssist() {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const appendMessage = useCallback((msg: AIMessage) => {
    setMessages(prev => [...prev, msg]);
  }, []);

  const sendMessage = useCallback(async (prompt: string, context: string) => {
    const userMsg: AIMessage = { id: Date.now().toString(), role: 'user', content: prompt, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    
    const assistantMsgId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: assistantMsgId, role: 'assistant', content: '', timestamp: Date.now() }]);
    
    setIsGenerating(true);
    
    try {
      await latexApi.aiAssistStream(prompt, context, (chunk) => {
        setMessages(prev => prev.map(msg => 
          msg.id === assistantMsgId ? { ...msg, content: msg.content + chunk } : msg
        ));
      });
    } catch (error: any) {
      setMessages(prev => prev.map(msg => 
        msg.id === assistantMsgId ? { ...msg, content: msg.content + `\n\n**[System]** AI response failed: ${error.message || 'Please check network or backend service.'}` } : msg
      ));
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    isGenerating,
    sendMessage,
    appendMessage,
    clearMessages
  };
}

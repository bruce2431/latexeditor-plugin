import React, { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AIMessage } from '../types/latex';

interface AIAssistPanelProps {
  latexContent: string;
  onClose: () => void;
  mode?: 'sidebar' | 'floating';
  onApplyCode?: (code: string) => void;
  messages: AIMessage[];
  isConnected: boolean;
  isThinking: boolean;
  connectionError: string | null;
  onSendMessage: (prompt: string, context: string) => boolean;
  onClearMessages: () => void;
  onReconnect: () => void;
}

export const AIAssistPanel: React.FC<AIAssistPanelProps> = ({
  latexContent,
  onClose,
  mode = 'sidebar',
  onApplyCode,
  messages,
  isConnected,
  isThinking,
  connectionError,
  onSendMessage,
  onClearMessages,
  onReconnect,
}) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || isThinking) return;

    const success = onSendMessage(input, latexContent);
    if (success) {
      setInput('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
  };

  const wrapperClass =
    mode === 'sidebar'
      ? 'flex flex-col h-full bg-primary-900 w-[300px] shrink-0 font-sans'
      : 'flex flex-col h-full bg-primary-900 w-full font-sans';

  return (
    <aside className={wrapperClass}>
      <div
        className={`${mode === 'floating' ? 'ai-drag-handle cursor-move' : ''} h-[40px] bg-primary-800 border-b border-primary-800 flex items-center justify-between px-4 text-xs font-medium text-primary-100 shrink-0`}
      >
        <div className="flex items-center gap-2">
          <svg
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            className="w-4 h-4 text-primary-400"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
          <span>AI Assistant</span>
          {!isConnected && <span className="text-red-400 text-[10px]">(Offline)</span>}
        </div>
        <button
          onClick={onClose}
          className="text-primary-500 hover:text-primary-100 transition-colors cursor-pointer"
        >
          <svg
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            className="w-4 h-4"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <div className="flex-1 p-4 flex flex-col gap-4 overflow-y-auto">
        {messages.length === 0 && (
          <div className="bg-primary-800 border border-primary-800 rounded-lg p-3 text-[13px] leading-relaxed text-primary-100 shadow-sm relative">
            How can I help you with your LaTeX today? I can generate formulas, fix
            errors, or explain code.
          </div>
        )}

        {connectionError && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-[13px] text-red-400">
            <div className="font-medium mb-1">Connection Error</div>
            <div className="text-[12px] opacity-80">{connectionError}</div>
            <button
              onClick={onReconnect}
              className="mt-2 px-3 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded text-[12px] cursor-pointer"
            >
              Reconnect
            </button>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`w-full flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[90%] p-3 text-[13px] leading-relaxed rounded-xl shadow-sm ${
                msg.role === 'user'
                  ? 'bg-[#2a2a2a] text-primary-100'
                  : 'bg-transparent text-primary-100 markdown-body'
              }`}
            >
              {msg.role === 'user' ? (
                <div className="whitespace-pre-wrap">{msg.content}</div>
              ) : (
                <Markdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code(props) {
                      const { children, className, ...rest } = props;
                      const match = /language-(\w+)/.exec(className || '');
                      const codeContent = String(children).replace(/\n$/, '');

                      if (!match) {
                        return (
                          <code
                            className="bg-[#1e1e1e] px-1 py-0.5 rounded text-primary-300"
                            {...rest}
                          >
                            {children}
                          </code>
                        );
                      }

                      return (
                        <div className="my-2 rounded-lg border border-[#353535] bg-[#1e1e1e] overflow-hidden">
                          <div className="flex items-center justify-between px-3 py-1.5 bg-[#252525] border-b border-[#353535]">
                            <span className="text-[11px] text-primary-500 uppercase tracking-wider">
                              {match[1]}
                            </span>
                            <div className="flex items-center gap-3">
                              {onApplyCode && (
                                <button
                                  onClick={() => onApplyCode(codeContent)}
                                  className="text-primary-500 hover:text-green-400 transition-colors flex items-center gap-1 text-[11px] cursor-pointer"
                                >
                                  <svg
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                    className="w-3 h-3"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth="2"
                                      d="M14 5l7 7m0 0l-7 7m7-7H3"
                                    />
                                  </svg>
                                  应用
                                </button>
                              )}
                              <button
                                onClick={() => handleCopyCode(codeContent)}
                                className="text-primary-500 hover:text-primary-300 transition-colors flex items-center gap-1 text-[11px] cursor-pointer"
                              >
                                <svg
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                  className="w-3 h-3"
                                >
                                  <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                                  <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                                </svg>
                                复制
                              </button>
                            </div>
                          </div>
                          <div className="p-3 overflow-x-auto">
                            <pre className="text-[12px] font-mono text-primary-300 m-0">
                              <code className="block whitespace-pre">{codeContent}</code>
                            </pre>
                          </div>
                        </div>
                      );
                    },
                  }}
                >
                  {msg.content}
                </Markdown>
              )}
            </div>
          </div>
        ))}

        {isThinking && (
          <div className="text-[13px] text-primary-500 flex items-center gap-2 px-2">
            <div
              className="w-1.5 h-1.5 rounded-full bg-primary-600 animate-bounce"
              style={{ animationDelay: '0ms' }}
            />
            <div
              className="w-1.5 h-1.5 rounded-full bg-primary-600 animate-bounce"
              style={{ animationDelay: '150ms' }}
            />
            <div
              className="w-1.5 h-1.5 rounded-full bg-primary-600 animate-bounce"
              style={{ animationDelay: '300ms' }}
            />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-primary-800 bg-primary-900">
        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask AI..."
            disabled={!isConnected || isThinking}
            rows={2}
            className="w-full bg-primary-950 border border-primary-800 rounded-lg text-primary-100 py-2.5 pl-3 pr-10 text-[13px] focus:outline-none focus:border-primary-600 focus:ring-1 focus:ring-primary-600 transition-all shadow-sm resize-none disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            onClick={handleSend}
            disabled={!isConnected || isThinking || !input.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-primary-500 hover:text-primary-400 transition-colors p-1 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <svg
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              className="w-4 h-4"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
          </button>
        </div>

        <div className="flex items-center justify-between mt-2 text-[11px] text-primary-500">
          <div>
            {isConnected ? (
              <span className="text-green-400">Connected</span>
            ) : (
              <span className="text-red-400">Disconnected</span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClearMessages}
              className="hover:text-primary-300 transition-colors cursor-pointer"
            >
              Clear
            </button>
            <button
              onClick={onReconnect}
              className="hover:text-primary-300 transition-colors cursor-pointer"
            >
              Reconnect
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};

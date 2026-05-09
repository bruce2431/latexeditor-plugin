import { spawn } from 'child_process';
import { Readable } from 'stream';

export interface LaTeXAIRequest {
  prompt: string;
  context: string;
  conversationHistory: Array<{ role: string; content: string }>;
  documentId: string;
}

export interface AIResponse {
  content: string;
  stream?: AsyncIterable<string>;
}

export class HermesAgentAdapter {
  
  async processLaTeXRequest(request: LaTeXAIRequest): Promise<AIResponse> {
    // 构建系统提示
    const systemPrompt = this.buildLaTeXSystemPrompt();
    
    // 构建完整提示
    const fullPrompt = this.buildFullPrompt(request);
    
    // 使用 Hermes CLI 调用（支持流式）
    return this.callHermesCLIStreaming(fullPrompt, systemPrompt);
  }
  
  private buildLaTeXSystemPrompt(): string {
    return `你是一个专业的 LaTeX 编辑器 AI 助手，专门帮助用户编写、修改和优化 LaTeX 文档。

你的能力包括：
1. 解释 LaTeX 代码和命令
2. 检测和修复语法错误
3. 提供代码改进建议
4. 回答 LaTeX 相关问题
5. 根据需求生成新的 LaTeX 代码
6. 帮助用户理解复杂的 LaTeX 概念

响应格式要求：
- 对于代码修改，使用 \`\`\`latex ... \`\`\` 代码块
- 解释你的修改原因
- 保持对话友好和专业
- 如果用户要求修改代码，直接提供完整的修改后代码
- 如果用户要求解释代码，用简单易懂的语言说明

当前文档上下文已提供，请基于上下文进行回答。`;
  }
  
  private buildFullPrompt(request: LaTeXAIRequest): string {
    const { prompt, context, conversationHistory } = request;
    
    let historyText = '';
    if (conversationHistory && conversationHistory.length > 0) {
      // 只取最后5条消息作为上下文
      const recentHistory = conversationHistory.slice(-5);
      historyText = '最近的对话历史：\n';
      recentHistory.forEach(msg => {
        if (msg.role !== 'system') {
          historyText += `${msg.role}: ${msg.content}\n\n`;
        }
      });
    }
    
    return `${historyText}
LaTeX 文档内容：
\`\`\`latex
${context}
\`\`\`

用户请求：${prompt}

请基于以上文档内容和对话历史进行回答。`;
  }
  
  private async callHermesCLIStreaming(prompt: string, systemPrompt: string): Promise<AIResponse> {
    return new Promise((resolve, reject) => {
      // 使用 spawn 来获取流式输出
      // Hermes CLI 格式: hermes chat -m <model> -q <prompt>
      // 系统提示需要包含在 prompt 中
      const fullPrompt = `系统提示：${systemPrompt}\n\n用户请求：${prompt}`;
      
      const childProcess = spawn('/home/ma2431/hermes-agent/.venv/bin/hermes', [
        'chat',
        '-m', 'deepseek-chat',
        '-q', fullPrompt
      ], {
        cwd: '/home/ma2431/hermes-agent',
        env: {
          ...process.env,
          PATH: process.env.PATH,
          HERMES_HOME: '/home/ma2431/.hermes'
        }
      });
      
      let output = '';
      const chunks: string[] = [];
      
      childProcess.stdout.on('data', (data: Buffer) => {
        const chunk = data.toString();
        output += chunk;
        chunks.push(chunk);
      });
      
      childProcess.stderr.on('data', (data: Buffer) => {
        console.error('Hermes stderr:', data.toString());
      });
      
      childProcess.on('close', (code: number) => {
        if (code === 0) {
          resolve({
            content: output,
            stream: this.createStreamFromChunks(chunks)
          });
        } else {
          reject(new Error(`Hermes process exited with code ${code}`));
        }
      });
      
      childProcess.on('error', (error: Error) => {
        reject(error);
      });
      
      // 设置超时
      setTimeout(() => {
        if (childProcess.exitCode === null) {
          childProcess.kill();
          reject(new Error('Hermes process timeout after 60 seconds'));
        }
      }, 60000);
    });
  }
  
  private createStreamFromChunks(chunks: string[]): AsyncIterable<string> {
    return {
      async *[Symbol.asyncIterator]() {
        for (const chunk of chunks) {
          yield chunk;
          // 添加小延迟模拟流式效果
          await new Promise(resolve => setTimeout(resolve, 20));
        }
      }
    };
  }
  
  // 备用方法：使用 HTTP API（如果 Hermes Agent 提供 HTTP 接口）
  private async callHermesHTTP(prompt: string, systemPrompt: string): Promise<AIResponse> {
    try {
      // 这里可以连接到 Hermes Agent 的 HTTP 接口（如果可用）
      const response = await fetch('http://localhost:8000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt,
          system: systemPrompt,
          stream: true
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }
      
      // 处理流式响应
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      let content = '';
      const stream = {
        async *[Symbol.asyncIterator]() {
          if (!reader) return;
          
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              
              const chunk = decoder.decode(value);
              content += chunk;
              yield chunk;
            }
          } finally {
            reader.releaseLock();
          }
        }
      };
      
      return {
        content,
        stream
      };
    } catch (error) {
      console.error('HTTP call failed, falling back to CLI:', error);
      // 回退到 CLI 方法
      return this.callHermesCLIStreaming(prompt, systemPrompt);
    }
  }
}
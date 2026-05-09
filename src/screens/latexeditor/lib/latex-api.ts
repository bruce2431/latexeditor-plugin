import { CompileAsset, CompileResult, SyncTexResult } from '../types/latex';

const API_BASE = '/api/latex';

export const latexApi = {
  async compile(
    files: Record<string, string>,
    mainFile: string,
    compiler: string = 'pdflatex',
    assets: CompileAsset[] = [],
  ): Promise<CompileResult> {
    try {
      const res = await fetch(`${API_BASE}/compile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files, mainFile, compiler, assets }),
      });
      if (!res.ok) throw new Error('Compile failed');
      const data = await res.json();

      const pdfUrl = data.success && data.pdfId ? `${API_BASE}/pdf/${data.pdfId}` : undefined;

      return {
        success: data.success,
        logs: data.logs,
        pdfUrl,
        pdfId: data.pdfId,
        errors: data.errors,
      };
    } catch (error) {
      console.error('Compile error:', error);
      return {
        success: false,
        logs: String(error),
        errors: [{ message: 'Network or server error', raw: String(error) }],
      };
    }
  },

  async reverseSync(pdfId: string, page: number, x: number, y: number): Promise<SyncTexResult> {
    try {
      const res = await fetch(`${API_BASE}/sync/${encodeURIComponent(pdfId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page, x, y }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, message: data.message || data.logs || 'SyncTeX lookup failed' };
      }
      return data;
    } catch (error) {
      return { success: false, message: String(error) };
    }
  },

  async aiAssistStream(
    prompt: string,
    context: string,
    onMessage: (chunk: string) => void,
  ): Promise<void> {
    try {
      const res = await fetch(`${API_BASE}/ai-assist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, context }),
      });

      if (!res.body) throw new Error('No response body');

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}: ${await res.text()}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        let newlineIndex;

        while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);

          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (dataStr === '[DONE]') return;
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.error) {
                throw new Error(parsed.error);
              }
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) onMessage(content);
            } catch (e) {
              if (e instanceof Error && !e.message.includes('JSON')) {
                throw e;
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('AI Assist error:', error);
      throw error;
    }
  },
};

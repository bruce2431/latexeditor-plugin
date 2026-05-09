export type EditorViewMode = 'split' | 'editor-only' | 'preview-only';

export interface LatexFile {
  id: string;
  name: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  type?: 'tex' | 'bib' | 'image';
}

export const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.svg', '.gif'];
export const getFileType = (name: string): LatexFile['type'] => {
  if (IMAGE_EXTS.some(ext => name.toLowerCase().endsWith(ext))) return 'image';
  if (name.endsWith('.bib')) return 'bib';
  return 'tex';
};

export interface ProjectVersion {
  id: string;
  projectId: string;
  timestamp: number;
  snapshot: Record<string, string>; // fileId -> content
  description?: string;
}

export interface LatexProject {
  id: string;
  name: string;
  files: LatexFile[];
  mainFileId: string;
  createdAt: number;
  updatedAt: number;
}

export interface AIMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface AIConversation {
  id: string;
  messages: AIMessage[];
}

export interface EditorSettings {
  fontSize: number;
  wordWrap: boolean;
  showExplorer: boolean;
  showEditor: boolean;
  showPreview: boolean;
  autoCompile: boolean;
}

export interface CompileError {
  line?: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
  raw?: string;
}

export interface CompileResult {
  pdfUrl?: string;
  pdfId?: string;
  success: boolean;
  errors?: CompileError[];
  logs: string;
}

export interface CompileAsset {
  name: string;
  mimeType: string;
  base64: string;
}

export interface SyncTexResult {
  success: boolean;
  file?: string;
  line?: number;
  column?: number;
  logs?: string;
  message?: string;
}

export interface LatexSymbol {
  command: string;
  display: string;
  description: string;
}

export interface SymbolCategory {
  name: string;
  symbols: LatexSymbol[];
}

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import Draggable from 'react-draggable';
import { EditorPane, EditorPaneRef } from './components/EditorPane';
import { PreviewPane } from './components/PreviewPane';
import { AIAssistPanel } from './components/AIAssistPanel';
import { FileTree } from './components/FileTree';
import { useLatexEditor } from './hooks/useLatexEditor';
import { useLatexProject } from './hooks/useLatexProject';
import { useWebSocketAI } from './hooks/useWebSocketAI';
import { latexApi } from './lib/latex-api';
// 【注意这里引入新增了 LayoutGrid 和 List 这两个用于网格、列表图标】
import { Home, Eye, MessageSquare, FileOutput, ArrowUp, Check, ChevronDown, ChevronUp, Pencil, Trash, Copy, Download, Sparkles, Folder, Plus, FileText, Clock, ChevronLeft, LayoutGrid, List } from 'lucide-react';
import * as db from './lib/db';
import { LatexProject, AIMessage, CompileError, getFileType } from './types/latex';

// --- Dashboard Component (带视图模式切换与 ZIP 导入) ---
function ProjectDashboard({ onSelect }: { onSelect: (id: string) => void }) {
  const [projects, setProjects] = useState<LatexProject[]>([]);
  const [loading, setLoading] = useState(true);
  
  // 新增加的状态记录：当前是采用 网格排版 还是 列表排版
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const decodeZipFileName = (bytes: Uint8Array) => {
    const tryDecode = (encoding: string) => {
      try {
        return new TextDecoder(encoding, { fatal: true }).decode(bytes);
      } catch {
        return null;
      }
    };

    return (
      tryDecode('utf-8') ??
      tryDecode('gb18030') ??
      tryDecode('gbk') ??
      new TextDecoder().decode(bytes)
    );
  };

  const loadProjects = async () => {
    setLoading(true);
    const p = await db.getProjects();
    setProjects(p);
    setLoading(false);
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const handleCreateNew = async () => {
    // ...逻辑不变... //
    const newId = Date.now().toString();
    const mainFileId = "file-" + Date.now();
    const newProject: LatexProject = {
      id: newId,
      name: "Untitled Project",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      mainFileId: mainFileId,
      files: [{
        id: mainFileId,
        name: "main.tex",
        content: "% !TEX program = pdflatex\n\\documentclass{article}\n\\begin{document}\n\n\\title{New Document}\n\\author{Hermes Workspace}\n\\maketitle\n\nHello, Hermes LaTeX!\n\n\\end{document}",
        createdAt: Date.now(),
        updatedAt: Date.now()
      }]
    };
    await db.saveProject(newProject);
    onSelect(newId);
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (window.confirm("确定要删除此项目吗？")) {
      await db.deleteProject(id);
      loadProjects();
    }
  };

  const handleImportZip = async (e: React.ChangeEvent<HTMLInputElement>) => {
    // ...ZIP 导入逻辑不变，隐藏 file input... //
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setLoading(true);
      const JSZip = (await import('jszip')).default;
      const zip = await JSZip.loadAsync(file, { decodeFileName: decodeZipFileName });
      const files: any[] = [];
      let mainFileId = "";
      const zipEntries = Object.keys(zip.files);
      for (const rawPath of zipEntries) {
        const zipEntry = zip.files[rawPath];
        if (!zipEntry.dir && !rawPath.includes('__MACOSX') && !rawPath.startsWith('.')) {
          const fileId = "file-" + Date.now() + Math.random().toString(36).substring(2, 7);
          const fileName = rawPath.split('/').pop() || rawPath;
          const fileType = getFileType(fileName);
          if (fileType === 'image') {
            const blob = await zipEntry.async('blob');
            await db.saveImage(fileName, blob, blob.type || 'application/octet-stream');
            files.push({
              id: fileId,
              name: fileName,
              content: `[Image: ${fileName}]`,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              type: 'image',
            });
          } else {
            const content = await zipEntry.async("string");
            files.push({
              id: fileId,
              name: fileName,
              content,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              type: fileType,
            });
          }
          if (!mainFileId && fileName.endsWith('main.tex')) mainFileId = fileId;
        }
      }
      if (files.length === 0) {
        alert("ZIP 文件中没有找到有效的文件。");
        setLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      if (!mainFileId) {
        const texFile = files.find(f => f.name.endsWith('.tex'));
        mainFileId = texFile ? texFile.id : files[0].id;
      }
      const newProject: LatexProject = {
        id: Date.now().toString(),
        name: file.name.replace('.zip', ''),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        mainFileId,
        files
      };
      await db.saveProject(newProject);
      await loadProjects();
    } catch (err) {
      console.error("Import failed:", err);
      alert("导入失败，请检查压缩包格式。");
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-primary-950 text-primary-100 font-sans overflow-hidden">
      <header className="h-[60px] border-b border-primary-800 flex items-center px-6 bg-primary-900 shrink-0">
        <div className="flex items-center gap-3">
          <Folder className="w-5 h-5 text-primary-400" />
          <h1 className="text-base font-semibold text-primary-50">LaTeX 工作区</h1>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-6xl mx-auto">
          
          <div className="flex justify-between items-end mb-6 border-b border-primary-800 pb-4">
            
            {/* 网格 / 列表视图切换 Toggle */}
            <div className="flex gap-2 bg-primary-900 border border-primary-800 rounded-lg p-1">
              <button 
                onClick={() => setViewMode('grid')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'grid' ? 'bg-primary-700 text-primary-100 shadow-sm' : 'text-primary-500 hover:text-primary-300'}`}
              >
                <LayoutGrid className="w-4 h-4" />
                网格视图
              </button>
              <button 
                onClick={() => setViewMode('list')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'list' ? 'bg-primary-700 text-primary-100 shadow-sm' : 'text-primary-500 hover:text-primary-300'}`}
              >
                <List className="w-4 h-4" />
                列表视图
              </button>
            </div>
            
            <div className="flex items-center gap-3 ml-auto pb-0 shrink-0">
              <input type="file" accept=".zip" ref={fileInputRef} onChange={handleImportZip} className="hidden" />
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 bg-primary-800 hover:bg-primary-700 text-primary-100 px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer border border-primary-700"
              >
                <ArrowUp className="w-4 h-4" />
                导入 ZIP
              </button>
              <button 
                onClick={handleCreateNew}
                className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                新建项目
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center p-12 text-primary-500 animate-pulse">正在加载项目列表...</div>
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-20 border border-dashed border-primary-800 rounded-2xl bg-primary-900/30 mt-8">
              <FileText className="w-12 h-12 text-primary-700 mb-4" />
              <p className="text-primary-400 mb-6">您目前还没有任何 LaTeX 项目。</p>
              <div className="flex gap-4">
                <button onClick={handleCreateNew} className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white px-5 py-2.5 rounded-lg font-medium transition-colors cursor-pointer shadow-sm">
                  <Plus className="w-4 h-4" /> 创建第一个项目
                </button>
                <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 bg-primary-800 hover:bg-primary-700 text-primary-100 px-5 py-2.5 rounded-lg font-medium transition-colors cursor-pointer shadow-sm">
                  <ArrowUp className="w-4 h-4" /> 导入本地 ZIP
                </button>
              </div>
            </div>
          ) : viewMode === 'grid' ? (
            // ================== 网格/卡片视图 (Icon Grid) ==================
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 pt-2">
              {projects.map(proj => (
                <div key={proj.id} onClick={() => onSelect(proj.id)} className="group relative bg-primary-900 border border-primary-800 rounded-xl p-5 hover:border-primary-600 hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer flex flex-col">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary-800 flex items-center justify-center text-primary-400 group-hover:text-primary-300 group-hover:bg-primary-700 transition-colors">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div className="max-w-[180px]">
                        <h3 className="font-medium text-primary-100 group-hover:text-white transition-colors truncate">{proj.name}</h3>
                        <div className="flex items-center gap-1.5 text-xs text-primary-500 mt-1">
                          <Clock className="w-3 h-3" />
                          <span>{new Date(proj.updatedAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-auto pt-4 flex items-center justify-between border-t border-primary-800/50">
                    <span className="text-xs text-primary-500">{proj.files.length} 个文件</span>
                    <button onClick={(e) => handleDelete(e, proj.id)} className="opacity-0 group-hover:opacity-100 p-1.5 text-primary-500 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-all cursor-pointer" title="Delete project">
                      <Trash className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            // ================== 列表视图 (List Rows) ==================
            <div className="flex flex-col gap-3 pt-2">
              {projects.map(proj => (
                <div key={proj.id} onClick={() => onSelect(proj.id)} className="group flex items-center justify-between p-4 bg-primary-900 border border-primary-800 rounded-xl hover:border-primary-600 hover:shadow-md transition-all cursor-pointer">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-primary-800 flex items-center justify-center text-primary-400 group-hover:text-primary-300 group-hover:bg-primary-700 transition-colors">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-medium text-primary-100 group-hover:text-white transition-colors">{proj.name}</h3>
                      <div className="flex items-center gap-1.5 text-xs text-primary-500 mt-1">
                        <Clock className="w-3 h-3" />
                        <span>{new Date(proj.updatedAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <span className="text-sm text-primary-500">{proj.files.length} 个文件</span>
                    <button onClick={(e) => handleDelete(e, proj.id)} className="opacity-0 group-hover:opacity-100 p-2 text-primary-500 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-all cursor-pointer">
                      <Trash className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


// 主入口切换状态管理

export default function LatexeditorScreen() {
  const navigate = useNavigate();

  // 从原生的 window location 获取 id
  // 注意，我加了一个状态变量来使得页面能做内部状态切换。
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (id) {
       setSelectedProjectId(id);
    }
  }, []);

  const handleBackToDashboard = () => {
    // 退回仪表盘 (清空 ID)
    setSelectedProjectId(null);
    // 这里也可以顺手用 window.history 清掉 URL 里的 ?id=xxx 让它干净
    window.history.replaceState({}, document.title, window.location.pathname);
  };

  const handleSelectProject = (projectId: string) => {
    // 点击了某个项目的选项卡，进入！！
    setSelectedProjectId(projectId);
    // 可选：在 url 上挂上参数，刷新不丢
    window.history.pushState({}, '', `${window.location.pathname}?id=${projectId}`);
  };

  // 1. 如果有选中的 Project ID，加载编辑器：
  if (selectedProjectId) {
    return (
      <EditorLauncher 
        projectId={selectedProjectId} 
        onBack={handleBackToDashboard} 
      />
    );
  }

  // 2. 如果没有选中的 Project ID，加载最初的那个【选项卡仪表盘】：
  return (
    <ProjectDashboard 
      onSelect={handleSelectProject} 
      onBack={() => {
        // 如果在最外层（仪表盘）点返回，我们认为您想离开 LaTeX 功能
        // 才真正调用 tanstack 的 navigate 回到根目录对话去。
        navigate({ to: '/' }).catch(() => {
          window.location.href = '/';
        });
      }} 
    />
  );
}

function EditorLauncher({ projectId, onBack }: { projectId: string; onBack: () => void }) {
  const { project, updateFile, setProject, saveProject, deleteProject, importFiles, getImageDataUrl, importImages, getCompileAssets, isLoading } = useLatexProject(projectId);
  const { settings, activeFileId, setActiveFileId, togglePanel } = useLatexEditor();
  // WebSocket AI 助手
  const {
    messages: aiMessages,
    isThinking: isGenerating,
    isConnected: isAIConnected,
    connectionError: aiConnectionError,
    sendMessage: sendAIMessage,
    clearMessages: clearAIMessages,
    reconnect: reconnectAI
  } = useWebSocketAI(project?.id || 'default', `latex-${project?.id || 'default'}`);
  
  const [showAI, setShowAI] = useState(true);
  const [isFloatingAI, setIsFloatingAI] = useState(false);
  const floatAIWindowRef = useRef<HTMLDivElement>(null);

  // AI代码应用相关状态
  const [aiDiffTarget, setAiDiffTarget] = useState<{ from: number, to: number, selectedText: string } | null>(null);
  const [pendingAiCode, setPendingAiCode] = useState<string | null>(null);

  // Ctrl+K menu states
  const [aiMenu, setAiMenu] = useState<{ top: number, left: number, selectedText: string, from: number, to: number } | null>(null);
  const [aiMenuPrompt, setAiMenuPrompt] = useState("");

  const [commentDialog, setCommentDialog] = useState<{ top: number, left: number, selectedText: string, from: number, to: number } | null>(null);
  const [commentText, setCommentText] = useState("");

  const [moveFileDialog, setMoveFileDialog] = useState<{ selectedText: string, from: number, to: number } | null>(null);
  const [moveFileName, setMoveFileName] = useState("");

  const [isCompiling, setIsCompiling] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [syncPdfId, setSyncPdfId] = useState<string | null>(null);
  const [compileLogs, setCompileLogs] = useState<string | null>(null);
  const [showProjectMenu, setShowProjectMenu] = useState(false);
  
  // 新增：选中的图片状态（用于图片预览）
  const [selectedImage, setSelectedImage] = useState<{ name: string; dataUrl: string } | null>(null);
  const projectMenuRef = useRef<HTMLDivElement>(null);
  const projectTitleRef = useRef<HTMLDivElement>(null);
  const editorPaneRef = useRef<EditorPaneRef>(null);
  const pendingPdfJumpRef = useRef<{ fileId: string; line: number } | null>(null);

  // 处理图片选择的函数
  const handleImageSelect = async (name: string) => {
    if (!project) return;
    try {
      console.log(`[DEBUG] 开始加载图片: ${name}`);
      const dataUrl = await getImageDataUrl(name);
      console.log(`[DEBUG] 图片加载成功, dataUrl 前 50 字符: ${dataUrl.substring(0, 50)}...`);
      setSelectedImage((prev) => {
        if (prev?.dataUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(prev.dataUrl);
        }
        return { name, dataUrl };
      });
      console.log(`[DEBUG] 设置 selectedImage 状态成功`);
    } catch (error) {
      console.error('[DEBUG] 加载图片失败:', error);
    }
  };

  useEffect(() => {
    return () => {
      if (selectedImage?.dataUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(selectedImage.dataUrl);
      }
    };
  }, [selectedImage]);

  const clearSelectedImage = useCallback(() => {
    setSelectedImage((prev) => {
      if (prev?.dataUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(prev.dataUrl);
      }
      return null;
    });
  }, []);

  const handleSelectProjectFile = useCallback((fileId: string) => {
    const nextFile = project?.files.find((file) => file.id === fileId);
    if (nextFile?.type !== 'image') {
      clearSelectedImage();
    }
    setActiveFileId(fileId);
  }, [clearSelectedImage, project, setActiveFileId]);

  // Custom Modal States
  const [renameDialog, setRenameDialog] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [deleteDialog, setDeleteDialog] = useState(false);

  const [compileErrors, setCompileErrors] = useState<CompileError[]>([]);

  const activeFile = useMemo(() => {
    if (!project) return null;
    return project.files.find(f => f.id === activeFileId) || project.files[0];
  }, [project, activeFileId]);

  const activeCompiler = useMemo(() => {
    if (!project || !project.files) return 'pdflatex';
    const mainFile = project.files.find(f => f.id === project.mainFileId);
    if (!mainFile || !mainFile.content) return 'pdflatex';
    const match = mainFile.content.match(/^%\s*!TEX\s+program\s*=\s*(pdflatex|xelatex|lualatex)/i);
    return match ? match[1] : 'pdflatex';
  }, [project]);

// 错误解析逻辑 - 最终版
  const parseCompileErrors = useCallback((logs: string): CompileError[] => {
    const errors: CompileError[] = [];
    const lines = logs.split('\n');
    
    console.log('=== [DEBUG] LaTeX 编译日志 - 开始解析 ===');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let severity: 'error' | 'warning' | 'info' = 'info';
      let message = line;
      let lineNum: number | undefined;
      
      const trimmed = line.trim();
      
      // 检测级别
      if (trimmed.startsWith('!')) {
        severity = 'error';
      } else if (trimmed.includes('Error:') || trimmed.includes('fatal error')) {
        severity = 'error';
      } else if (trimmed.includes('LaTeX Warning:') || trimmed.includes('Warning:')) {
        severity = 'warning';
      }
      
      // === 行号提取 - 多格式支持 ===
      // 格式1: l.123
      let lineMatch = line.match(/l\.(\d+)/);
      if (lineMatch) {
        lineNum = parseInt(lineMatch[1]);
        console.log(`[DEBUG] 提取到行号格式1 (l.XX): 第 ${lineNum} 行`);
      } 
      
      // 格式2: 第 38 行:l.38
      if (!lineNum) {
        lineMatch = line.match(/第\s*(\d+)\s*行/);
        if (lineMatch) {
          lineNum = parseInt(lineMatch[1]);
          console.log(`[DEBUG] 提取到行号格式2 (第 XX 行): 第 ${lineNum} 行`);
        }
      }
      
      // 格式3: line 123
      if (!lineNum) {
        lineMatch = line.match(/(?:[Ll]ine|[Ll]n?)\s*(\d+)/);
        if (lineMatch) {
          lineNum = parseInt(lineMatch[1]);
          console.log(`[DEBUG] 提取到行号格式3 (line XX): 第 ${lineNum} 行`);
        }
      }
      
      // 添加到错误列表
      if (trimmed && trimmed.length > 0) {
        // 显示所有错误和警告，以及有行号的信息
        if (severity === 'error' || 
            severity === 'warning' ||
            trimmed.startsWith('!') || 
            trimmed.includes('Fatal') ||
            lineNum !== undefined ||
            trimmed.match(/^\(.+\/[^/]+\)/)) {
          
          const errorObj = {
            message: message,
            severity: severity,
            line: lineNum
          };
          
          console.log(`[DEBUG] 添加错误对象:`, JSON.stringify(errorObj));
          errors.push(errorObj);
        }
      }
    }
    
    console.log(`[DEBUG] 总共解析出 ${errors.length} 个错误/警告`);
    console.log('=== [DEBUG] 解析完成 ===');
    
    return errors;
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        projectMenuRef.current && 
        !projectMenuRef.current.contains(e.target as Node) &&
        projectTitleRef.current &&
        !projectTitleRef.current.contains(e.target as Node)
      ) {
        setShowProjectMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleRenameProject = () => {
    if (!project) return;
    setRenameValue(project.name);
    setRenameDialog(true);
    setShowProjectMenu(false);
  };

  const submitRename = async () => {
    if (project && renameValue.trim()) {
      const updated = { ...project, name: renameValue.trim(), updatedAt: Date.now() };
      await saveProject(updated);
    }
    setRenameDialog(false);
  };

  const handleDeleteProject = () => {
    setDeleteDialog(true);
    setShowProjectMenu(false);
  };

  const confirmDelete = async () => {
    await deleteProject();
    setDeleteDialog(false);
    onBack(); 
  };

  const handleDuplicateProject = async () => {
    if (!project) return;
    const newProject = {
      ...project,
      id: Date.now().toString(),
      name: `${project.name} (Copy)`,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    await saveProject(newProject);
    setShowProjectMenu(false);
    onBack();
  };

  const handleExportZip = async () => {
    if (!project) return;
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    for (const file of project.files) {
      if (file.type === 'image' || getFileType(file.name) === 'image') {
        const imageUrl = await getImageDataUrl(file.name);
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        URL.revokeObjectURL(imageUrl);
        zip.file(file.name, blob);
      } else {
        zip.file(file.name, file.content);
      }
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    setShowProjectMenu(false);
  };

  const handleShowCompilerHelp = () => {
    setShowProjectMenu(false);
    if (!showAI) setShowAI(true);
    
    // Simulate user ask
    appendMessage({
      id: Date.now().toString(),
      role: 'user',
      content: 'How do I use XeLaTeX / LuaLaTeX?',
      timestamp: Date.now()
    });

    // Simulate system response matching the requested UI
    setTimeout(() => {
      appendMessage({
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Just add\n\n\`\`\`latex\n% !TEX program = xelatex\n\`\`\`\n\nor\n\n\`\`\`latex\n% !TEX program = lualatex\n\`\`\`\n\nto the preamble of your main tex file.`,
        timestamp: Date.now() + 1
      });
    }, 500);
  };

  useEffect(() => {
    const pendingJump = pendingPdfJumpRef.current;
    if (!pendingJump || pendingJump.fileId !== activeFileId) return;

    const timer = window.setTimeout(() => {
      editorPaneRef.current?.jumpToLine(pendingJump.line);
      pendingPdfJumpRef.current = null;
    }, 80);

    return () => window.clearTimeout(timer);
  }, [activeFileId, activeFile?.content]);

  if (isLoading) {
    return <div className="flex items-center justify-center h-full w-full bg-primary-950 text-primary-400 animate-pulse">Loading Hermes LaTeX Environment...</div>;
  }

  if (!project) {
    return <div className="flex items-center justify-center h-full w-full bg-primary-950 text-red-500">Failed to initialize project space.</div>;
  }

  const handleCtrlM = (pos: { top: number, left: number }, selectedText: string, from: number, to: number) => {
    setAiMenu({ top: pos.top + 8, left: pos.left, selectedText, from, to });
    setCommentDialog(null);
    setMoveFileDialog(null);
    setAiMenuPrompt("");
  };

  const handleAICommand = (type: string, prompt?: string) => {
    if (!aiMenu || !project || !activeFile) return;
    
    setAiDiffTarget({ from: aiMenu.from, to: aiMenu.to, selectedText: aiMenu.selectedText });
    
    if (type === 'proofread') {
      sendAIMessage(`请结合上下文审视并校对以下内容的逻辑：\n\n\`\`\`latex\n${aiMenu.selectedText}\n\`\`\``, activeFile.content);
      if (!showAI) setIsFloatingAI(true);
    } else if (type === 'custom') {
      sendAIMessage(`${prompt}\n\n参考内容：\n\n\`\`\`latex\n${aiMenu.selectedText}\n\`\`\``, activeFile.content);
      if (!showAI) setIsFloatingAI(true);
    }
    setAiMenu(null);
  };

  const handleApplyAiCode = (code: string) => {
    if (!activeFile) return;
    if (aiDiffTarget && activeFile.content.substring(aiDiffTarget.from, aiDiffTarget.to) === aiDiffTarget.selectedText) {
      // Replace only the targeted text
      const newContent = activeFile.content.substring(0, aiDiffTarget.from) + code + activeFile.content.substring(aiDiffTarget.to);
      setPendingAiCode(newContent);
    } else {
      // If we don't have a valid target or the content drifted, let's just attempt to replace the whole file 
      // or what makes sense. Usually AI might output the whole file if it's small, or a chunk.
      // If it's a chunk and we lost context, replacing the whole file is risky but doing nothing is worse.
      // Assuming AI outputs the whole document if aiDiffTarget is lost.
      setPendingAiCode(code);
    }
  };

  const handleSaveComment = () => {
    if (!commentDialog || !activeFile) return;
    const { to } = commentDialog;
    
    const before = activeFile.content.slice(0, to);
    const after = activeFile.content.slice(to);
    const newContent = `${before}\n% [评论]: ${commentText}\n${after}`;
    
    updateFile(activeFile.id, newContent);
    setCommentDialog(null);
    setCommentText('');
  };

  const handleRenameProjectFile = async (fileId: string, newName: string) => {
    if (!project) return;
    const newFiles = project.files.map(f => f.id === fileId ? { ...f, name: newName, updatedAt: Date.now() } : f);
    await saveProject({ ...project, files: newFiles, updatedAt: Date.now() });
  };

  const handleDeleteProjectFile = async (fileId: string) => {
    if (!project) return;
    if (fileId === project.mainFileId) {
      alert("保护机制启动：不能删除主文件 (main.tex)！");
      return;
    }
    const newFiles = project.files.filter(f => f.id !== fileId);
    await saveProject({ ...project, files: newFiles, updatedAt: Date.now() });
    if (activeFileId === fileId) {
      setActiveFileId(newFiles[0]?.id || null);
    }
  };

  const handleDownloadProjectFile = (fileId: string) => {
    if (!project) return;
    const file = project.files.find(f => f.id === fileId);
    if (!file) return;
    const blob = new Blob([file.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveMoveFile = async () => {
    if (!moveFileDialog || !project || !activeFile) return;
    let newName = moveFileName.trim();
    if (!newName) return;
    if (!newName.endsWith('.tex')) {
      newName += '.tex';
    }
    
    // Create new file with selected content
    const newFile = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
      name: newName,
      content: moveFileDialog.selectedText,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    const { from, to } = moveFileDialog;
    const before = activeFile.content.slice(0, from);
    const after = activeFile.content.slice(to);
    
    const baseName = newName.replace('.tex', '');
    const newContent = `${before}\\input{${baseName}}${after}`;
    
    const newFiles = [...project.files.map(f => f.id === activeFile.id ? { ...f, content: newContent } : f), newFile];

    const newProject = { ...project, files: newFiles, updatedAt: Date.now() };
    await saveProject(newProject);
    setMoveFileDialog(null);
    setMoveFileName('');
  };

  const handleContentChange = (content: string) => {
    if (activeFile) updateFile(activeFile.id, content);
    setAiMenu(null);
    setCommentDialog(null);
  };

  const handlePdfSyncClick = async (page: number, x: number, y: number) => {
    if (!project || !syncPdfId) return;

    const result = await latexApi.reverseSync(syncPdfId, page, x, y);
    if (!result.success || !result.line) {
      console.warn('[SyncTeX] No source match', result);
      return;
    }

    const normalizedTarget = (result.file || '').replace(/\\/g, '/');
    const targetFile = project.files.find((file) => {
      const normalizedName = file.name.replace(/\\/g, '/');
      return (
        normalizedName === normalizedTarget ||
        normalizedTarget.endsWith(`/${normalizedName}`) ||
        normalizedName.endsWith(`/${normalizedTarget}`) ||
        normalizedName.split('/').pop() === normalizedTarget.split('/').pop()
      );
    });

    if (!targetFile) {
      console.warn('[SyncTeX] Source file not found in project', result.file);
      return;
    }

    pendingPdfJumpRef.current = { fileId: targetFile.id, line: result.line };
    if (targetFile.id !== activeFileId) {
      setActiveFileId(targetFile.id);
      return;
    }

    editorPaneRef.current?.jumpToLine(result.line);
    pendingPdfJumpRef.current = null;
  };

  const handleCompile = async () => {
    if (!project || !activeFile) return;
    setIsCompiling(true);
    setCompileLogs(null);
    setCompileErrors([]);
    setSyncPdfId(null);

    // 1. 先把文件字典安全地抽出来
    const filesRecord = project.files.reduce((acc, f) => {
      if (f.type === 'image' || getFileType(f.name) === 'image') {
        return acc;
      }
      // 保证拿出来的一定是字符串
      let contentString = f.content || '';
      if (typeof f.content === 'object') {
         contentString = (f.content as any).text || (f.content as any).content || '';
      }
      acc[f.name] = contentString;
      return acc;
    }, {} as Record<string, string>);

    // 2. 找到主文件的名字
    const mainFileName = project.files.find(f => f.id === project.mainFileId)?.name || 'main.tex';
    const imageFileNames = project.files
      .filter((file) => file.type === 'image' || getFileType(file.name) === 'image')
      .map((file) => file.name);

    try {
      const compileAssets = await getCompileAssets(imageFileNames);
      // 3. 按照 latexApi.compile 要求的格式，依次传入三个参数！不是传一个大括号对象！
      const result = await latexApi.compile(
        filesRecord,    // param 1: files
        mainFileName,   // param 2: mainFile
        activeCompiler,  // param 3: compiler
        compileAssets
      );

      console.log(`Compiled successfully using ${activeCompiler}`);
      
      // 后端回传了生成的真实 PDF Blob 内存地址，我们把它塞给代表 iframe 的 State 里！
      if (result.success && result.pdfUrl) {
         setPdfUrl(result.pdfUrl);
         setSyncPdfId(result.pdfId || null);
         setCompileErrors([]); // 成功时清空错误
      } else if (!result.success && result.logs) {
        // 解析错误日志
        setSyncPdfId(null);
        const errors = parseCompileErrors(result.logs);
        setCompileErrors(errors);
      }
      
      setCompileLogs(result.logs || '');
    } catch (e: any) {
      console.error(e);
      const errorLogs = String(e.message || e);
      setCompileLogs(errorLogs);
      setSyncPdfId(null);
      // 解析异常中的错误
      const errors = parseCompileErrors(errorLogs);
      setCompileErrors(errors);
    } finally {
      setIsCompiling(false);
    }
  };

  const handleFilesImport = async (files: {name: string, content: string}[]) => {
    if (!project || !importFiles) return;
    const imported = await importFiles(files);
    if (imported.length > 0) {
      setActiveFileId(imported[0].id);
    }
  };

  return (
    <div className="flex h-full w-full bg-primary-950 text-primary-100 font-sans overflow-hidden relative">
      {/* Ctrl+K AI Menu */}
      {aiMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setAiMenu(null)} />
          <div 
            className="fixed z-50 bg-[#1e1e1e] border border-[#2d2d2d] rounded-2xl shadow-2xl p-2 w-[300px] text-primary-100 font-sans"
            style={{ top: Math.min(aiMenu.top, window.innerHeight - 200), left: Math.min(aiMenu.left, window.innerWidth - 300) }}
          >
            <div className="relative mb-2">
              <input 
                autoFocus
                className="w-full bg-[#2d2d2d] rounded-xl py-2 px-3 pr-8 text-sm text-primary-100 focus:outline-none placeholder:text-primary-500"
                placeholder="输入提示"
                value={aiMenuPrompt}
                onChange={e => setAiMenuPrompt(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && aiMenuPrompt.trim()) handleAICommand('custom', aiMenuPrompt) }}
              />
              <ArrowUp 
                className={`absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 cursor-pointer transition-colors ${aiMenuPrompt.trim() ? 'text-primary-100' : 'text-primary-600'}`} 
                onClick={() => { if(aiMenuPrompt.trim()) handleAICommand('custom', aiMenuPrompt) }} 
              />
            </div>
            
            <div className="flex flex-col gap-1">
              <button 
                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-primary-100 hover:bg-[#2d2d2d] rounded-lg transition-colors text-left cursor-pointer"
                onClick={() => handleAICommand('proofread')}
              >
                <Check className="w-4 h-4 text-primary-500" /> 校对
              </button>
              <button 
                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-primary-100 hover:bg-[#2d2d2d] rounded-lg transition-colors text-left cursor-pointer"
                onClick={() => handleAICommand('comment')}
              >
                <MessageSquare className="w-4 h-4 text-primary-500" /> 添加评论
              </button>
              <button 
                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-primary-100 hover:bg-[#2d2d2d] rounded-lg transition-colors text-left cursor-pointer"
                onClick={() => {
                  setMoveFileDialog(aiMenu);
                  setMoveFileName("");
                  setAiMenu(null);
                }}
              >
                <FileOutput className="w-4 h-4 text-primary-500" /> 移动到文件
              </button>
            </div>
          </div>
        </>
      )}

      {/* Leave a Comment Popover */}
      {commentDialog && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setCommentDialog(null)} />
          <div 
            className="fixed z-50 bg-[#1e1e1e] border border-[#2d2d2d] rounded-2xl shadow-2xl p-4 w-[340px] text-primary-100 font-sans"
            style={{ top: Math.min(commentDialog.top, window.innerHeight - 200), left: Math.min(commentDialog.left, window.innerWidth - 340) }}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-cyan-700 flex items-center justify-center font-bold text-white text-xs">k</div>
                <span className="font-medium text-sm">kai ma</span>
                <span className="text-xs text-primary-500">现在</span>
              </div>
              <Check className="w-4 h-4 text-primary-500" />
            </div>
            
            {commentDialog.selectedText && (
              <div className="text-xs text-primary-400 mb-4 bg-[#252525] p-2 rounded-md truncate">
                {commentDialog.selectedText}
              </div>
            )}

            <div className="border-t border-[#2d2d2d] pt-3 mb-4">
              <textarea 
                autoFocus
                className="w-full bg-transparent resize-none text-sm text-primary-100 placeholder:text-primary-500 focus:outline-none"
                placeholder="撰写评论"
                rows={2}
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
              />
            </div>

            <div className="flex gap-4">
              <button className="text-sm font-medium hover:text-white transition-colors cursor-pointer" onClick={handleSaveComment}>保存</button>
              <button className="text-sm font-medium text-primary-500 hover:text-primary-300 transition-colors cursor-pointer" onClick={() => setCommentDialog(null)}>取消</button>
            </div>
          </div>
        </>
      )}

      {/* Move to File Dialog */}
      {moveFileDialog && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
          <div className="bg-primary-900 border border-primary-800 rounded-2xl p-6 w-[420px] shadow-2xl font-sans">
            <h3 className="text-base font-bold mb-4 text-primary-50">将选区发送到文件</h3>
            <input 
              autoFocus
              className="w-full bg-primary-950 border border-primary-800 rounded-lg py-2 px-3 text-sm text-primary-100 mb-6 focus:outline-none focus:border-primary-600"
              placeholder=".tex"
              value={moveFileName}
              onChange={e => setMoveFileName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveMoveFile() }}
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => setMoveFileDialog(null)} className="px-5 py-1.5 text-sm rounded-full bg-primary-800 text-primary-100 hover:bg-primary-700 transition-colors cursor-pointer">取消</button>
              <button onClick={handleSaveMoveFile} className="px-5 py-1.5 text-sm bg-primary-100 text-primary-950 rounded-full font-medium hover:bg-white transition-colors cursor-pointer">保存</button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Dialog */}
      {renameDialog && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
          <div className="bg-primary-900 border border-primary-800 rounded-2xl p-6 w-[420px] shadow-2xl font-sans">
            <h3 className="text-base font-bold mb-4 text-primary-50">重命名项目</h3>
            <input 
              autoFocus
              className="w-full bg-primary-950 border border-primary-800 rounded-lg py-2 px-3 text-sm text-primary-100 mb-6 focus:outline-none focus:border-primary-600"
              placeholder="Project Name"
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submitRename() }}
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => setRenameDialog(false)} className="px-5 py-1.5 text-sm rounded-full bg-primary-800 text-primary-100 hover:bg-primary-700 transition-colors cursor-pointer">取消</button>
              <button onClick={submitRename} className="px-5 py-1.5 text-sm bg-primary-100 text-primary-950 rounded-full font-medium hover:bg-white transition-colors cursor-pointer">保存</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Dialog */}
      {deleteDialog && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
          <div className="bg-primary-900 border border-primary-800 rounded-2xl p-6 w-[420px] shadow-2xl font-sans">
            <h3 className="text-base font-bold mb-4 text-red-400">删除项目</h3>
            <p className="text-sm text-primary-300 mb-6 leading-relaxed">
              您确定要删除此项目吗？此操作不可撤销，且所有文件将被永久删除。
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteDialog(false)} className="px-5 py-1.5 text-sm rounded-full bg-primary-800 text-primary-100 hover:bg-primary-700 transition-colors cursor-pointer">取消</button>
              <button onClick={confirmDelete} className="px-5 py-1.5 text-sm bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white border border-red-500/20 rounded-full font-medium transition-colors cursor-pointer">删除确认</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 z-10 h-full">
        {/* Header */}
        <header className="h-[48px] border-b border-primary-800 flex items-center justify-between px-4 bg-primary-900 shrink-0 relative">
          <div className="flex items-center gap-3 text-[13px] font-medium">
            <button onClick={onBack} className="text-primary-500 hover:text-red-400 transition-colors p-1 flex items-center" title="Go back to Project List">
              <ChevronLeft className="w-4 h-4 cursor-pointer" />
            </button>
            
            <button 
              onClick={() => togglePanel('showExplorer')}
              className={`p-1 rounded flex items-center transition-colors cursor-pointer ${settings.showExplorer ? 'bg-primary-700 text-primary-100' : 'text-primary-500 hover:text-primary-300 hover:bg-primary-800'}`}
              title="Toggle Explorer"
            >
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
            </button>

            <span className="text-primary-500 ml-1">Workspace /</span>
            
            <div className="relative">
              <div 
                ref={projectTitleRef}
                onClick={() => setShowProjectMenu(!showProjectMenu)}
                className="flex items-center gap-1 cursor-pointer hover:text-white transition-colors"
              >
                <strong>{project.name}</strong>
                {showProjectMenu ? <ChevronUp className="w-3 h-3 text-primary-400" /> : <ChevronDown className="w-3 h-3 text-primary-400" />}
              </div>

              {/* Project Dropdown Menu */}
              {showProjectMenu && (
                <div 
                  ref={projectMenuRef}
                  className="absolute top-full left-0 mt-2 w-[220px] bg-[#2a2a2a] border border-primary-800 rounded-xl shadow-2xl py-2 z-50 flex flex-col font-sans"
                >
                  <button onClick={handleRenameProject} className="flex items-center gap-3 px-4 py-2 hover:bg-[#353535] text-sm text-primary-100 transition-colors cursor-pointer text-left">
                    <Pencil className="w-4 h-4 text-primary-400" /> 重命名
                  </button>
                  <button onClick={handleDeleteProject} className="flex items-center gap-3 px-4 py-2 hover:bg-[#353535] text-sm text-primary-100 transition-colors cursor-pointer text-left">
                    <Trash className="w-4 h-4 text-primary-400" /> 删除
                  </button>
                  <button onClick={handleDuplicateProject} className="flex items-center gap-3 px-4 py-2 hover:bg-[#353535] text-sm text-primary-100 transition-colors cursor-pointer text-left">
                    <Copy className="w-4 h-4 text-primary-400" /> 复制
                  </button>
                  <button onClick={handleExportZip} className="flex items-center gap-3 px-4 py-2 hover:bg-[#353535] text-sm text-primary-100 transition-colors cursor-pointer text-left border-b border-[#353535] pb-3 mb-1">
                    <Download className="w-4 h-4 text-primary-400" /> 导出 (zip)
                  </button>
                  <button onClick={handleShowCompilerHelp} className="flex items-center gap-3 px-4 py-2 hover:bg-[#353535] text-sm text-primary-100 transition-colors cursor-pointer text-left pt-3">
                    <Sparkles className="w-4 h-4 text-primary-400" /> XeLaTeX / LuaLaTeX
                  </button>
                </div>
              )}
            </div>

            <span className="bg-primary-600 text-white px-1.5 py-0.5 rounded text-[10px] font-bold">NEW</span>
          </div>
          <div className="flex bg-primary-950 border border-primary-800 rounded-md p-0.5 gap-0.5">
            <button
              onClick={() => handleCompile()}
              disabled={isCompiling}
              className={`flex items-center gap-2 px-3 py-1.5 rounded text-[12px] font-medium transition-all ${
                isCompiling 
                  ? 'bg-primary-800 text-primary-400 cursor-not-allowed' 
                  : 'bg-primary-700 text-white hover:bg-primary-600 cursor-pointer shadow-sm'
              }`}
            >
              {isCompiling ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-primary-500 border-t-white rounded-full animate-spin" />
                  编译中...
                </>
              ) : (
                <>
                  <svg fill="currentColor" viewBox="0 0 24 24" className="w-3.5 h-3.5"><path d="M8 5v14l11-7z"/></svg>
                  编译 PDF
                </>
              )}
            </button>
          </div>
        </header>

        <div className="flex-1 min-h-0 bg-primary-950 flex flex-row w-full h-[calc(100%-48px-24px)]">
          <PanelGroup direction="horizontal">
            {/* File Explorer Panel */}
            {settings.showExplorer && (
              <>
                <Panel defaultSize={20} minSize={15} maxSize={30} id="explorer-panel">
                  <FileTree 
                    files={project.files} 
                    activeFileId={activeFileId} 
                    onSelectFile={handleSelectProjectFile} 
                    onClose={() => togglePanel('showExplorer')}
                    // ↓↓↓增加的这三行↓↓↓
                    onRenameFile={handleRenameProjectFile}
                    onDeleteFile={handleDeleteProjectFile}
                    onDownloadFile={handleDownloadProjectFile}
                    // ↓↓↓拖拽上传回调↓↓↓
                    onFilesImport={handleFilesImport}
                    // ↓↓↓图片相关回调↓↓↓
                    onImagesImport={importImages}
                    onImageSelect={handleImageSelect}
                    onInsertImageLatex={(name) => {
                      if (editorPaneRef.current) {
                        editorPaneRef.current.insertText(`\\includegraphics{${name}}`);
                      }
                    }}
                  />
                </Panel>
                <PanelResizeHandle className="w-[1px] bg-primary-800 hover:bg-primary-600 hover:w-[3px] transition-all cursor-col-resize z-50 flex flex-col justify-center items-center"><div className="w-1 h-8 rounded-full bg-primary-700"></div></PanelResizeHandle>
              </>
            )}

            

            {/* Editor Panel */}
            <Panel defaultSize={40} minSize={30} id="editor-panel">
              {activeFile ? (
                <EditorPane 
                  ref={editorPaneRef}
                  content={activeFile.content} 
                  onChange={handleContentChange}
                  onCtrlM={handleCtrlM}
                  pendingAiCode={pendingAiCode}
                  onClearPendingAiCode={() => setPendingAiCode(null)}
                />
              ) : (
                <div className="h-full flex items-center justify-center text-primary-500 font-sans">
                  Select a file to edit
                </div>
              )}
            </Panel>

            <PanelResizeHandle className="w-[1px] bg-primary-800 hover:bg-primary-600 hover:w-[3px] transition-all cursor-col-resize z-50 flex flex-col justify-center items-center"><div className="w-1 h-8 rounded-full bg-primary-700"></div></PanelResizeHandle>

            {/* PDF Preview Panel：强制开启显示！ */}
            <Panel defaultSize={40} minSize={30} id="preview-panel">
                {/* 如果 pdfUrl 有值，把按钮亮出来！ */}
                
                
                <PreviewPane 
                  pdfUrl={pdfUrl || undefined} 
                  logs={compileLogs || undefined} 
                  isLoading={isCompiling} 
                  errors={compileErrors}
                  onPdfClick={handlePdfSyncClick}
                  selectedImage={selectedImage}
                  onImageClose={clearSelectedImage}
                  onErrorClick={(line) => {
                    console.log(`[DEBUG] onErrorClick 被调用, 跳转到第 ${line} 行`);
                    console.log(`[DEBUG] editorPaneRef.current =`, editorPaneRef.current);
                    if (editorPaneRef.current) {
                      console.log(`[DEBUG] 执行 jumpToLine(${line})`);
                      editorPaneRef.current.jumpToLine(line);
                    } else {
                      console.error(`[DEBUG] 错误: editorPaneRef.current 为 null`);
                    }
                  }}
                />
            </Panel>
          </PanelGroup>
        </div>

        {/* Footer StatusBar */}
        <footer className="h-[24px] bg-primary-800 border-t border-primary-800 flex items-center px-4 justify-between text-[11px] font-mono text-primary-400 shrink-0">
          <div className="flex gap-4">
            <span className="flex items-center gap-1.5 hover:text-primary-100 cursor-pointer transition-colors">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              Ready
            </span>
          </div>
          <div className="flex gap-4 items-center">
            <span>{activeCompiler}</span>
            <span>UTF-8</span>
            <span>CRLF</span>
          </div>
        </footer>
      </div>

      {/* Embedded AI Assistant Panel */}
      {showAI && (
        <AIAssistPanel 
          latexContent={activeFile?.content || ''}
          onClose={() => setShowAI(false)}
          onApplyCode={handleApplyAiCode}
          messages={aiMessages}
          isConnected={isAIConnected}
          isThinking={isGenerating}
          connectionError={aiConnectionError}
          onSendMessage={sendAIMessage}
          onClearMessages={clearAIMessages}
          onReconnect={reconnectAI}
        />
      )}

      {/* AI Menu */}
      {aiMenu && (
        <div 
          className="fixed z-[9999] bg-[#2a2a2a] border border-primary-800 rounded-xl shadow-2xl py-2 w-[220px] flex flex-col font-sans"
          style={{ top: aiMenu.top, left: aiMenu.left }}
        >
          <div className="px-4 py-2 text-xs text-primary-400 border-b border-[#353535] mb-1">
            AI 助手
          </div>
          <button 
            onClick={() => handleAICommand('proofread')}
            className="flex items-center gap-3 px-4 py-2 hover:bg-[#353535] text-sm text-primary-100 transition-colors cursor-pointer text-left"
          >
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-4 h-4 text-primary-400"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            校对逻辑
          </button>
          <button 
            onClick={() => {
              const prompt = prompt('请输入自定义指令：');
              if (prompt) handleAICommand('custom', prompt);
            }}
            className="flex items-center gap-3 px-4 py-2 hover:bg-[#353535] text-sm text-primary-100 transition-colors cursor-pointer text-left"
          >
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-4 h-4 text-primary-400"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/></svg>
            自定义指令
          </button>
          <div className="px-4 py-2 text-xs text-primary-400 border-t border-[#353535] mt-1">
            {aiMenu.selectedText.length > 50 ? `${aiMenu.selectedText.substring(0, 50)}...` : aiMenu.selectedText}
          </div>
        </div>
      )}

      {/* AI Code Apply Confirmation Dialog */}
      {pendingAiCode !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10000]">
          <div className="bg-[#2a2a2a] border border-primary-800 rounded-xl shadow-2xl w-[500px] p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-primary-100">应用 AI 生成的代码</h3>
              <button 
                onClick={() => setPendingAiCode(null)}
                className="text-primary-500 hover:text-primary-100 transition-colors cursor-pointer"
              >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            
            <div className="bg-[#1e1e1e] border border-[#353535] rounded-lg p-4 max-h-[300px] overflow-y-auto">
              <pre className="text-[12px] font-mono text-primary-300 whitespace-pre-wrap">
                {pendingAiCode}
              </pre>
            </div>
            
            <div className="flex gap-3 justify-end">
              <button 
                onClick={() => setPendingAiCode(null)}
                className="px-4 py-2 bg-primary-800 hover:bg-primary-700 text-primary-100 rounded-lg text-sm font-medium transition-colors cursor-pointer"
              >
                取消
              </button>
              <button 
                onClick={() => {
                  if (activeFile && pendingAiCode !== null) {
                    updateFile(activeFile.id, pendingAiCode);
                    setPendingAiCode(null);
                  }
                }}
                className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer"
              >
                确认应用
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

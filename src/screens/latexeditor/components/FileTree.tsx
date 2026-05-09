import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Image as ImageIcon } from 'lucide-react';
import { LatexFile, getFileType, IMAGE_EXTS } from '../types/latex';

interface FileTreeProps {
  files: LatexFile[];
  activeFileId: string | null;
  onSelectFile: (id: string) => void;
  onClose?: () => void;
  onRenameFile?: (id: string, newName: string) => void;
  onDeleteFile?: (id: string) => void;
  onDownloadFile?: (id: string) => void;
  onFilesImport?: (files: { name: string; content: string }[]) => void;
  onImagesImport?: (images: { name: string; data: Blob; type: string }[]) => void;
  onImageSelect?: (name: string) => void;
  onInsertImageLatex?: (name: string) => void;
}

export const FileTree: React.FC<FileTreeProps> = ({
  files,
  activeFileId,
  onSelectFile,
  onClose,
  onRenameFile,
  onDeleteFile,
  onDownloadFile,
  onFilesImport,
  onImagesImport,
  onImageSelect,
  onInsertImageLatex,
}) => {
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    fileId: string;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const menuPosition = useMemo(() => {
    if (!contextMenu) return null;

    const menuWidth = 180;
    const menuHeight = 128;
    return {
      x: Math.max(8, Math.min(contextMenu.x, window.innerWidth - menuWidth - 8)),
      y: Math.max(8, Math.min(contextMenu.y, window.innerHeight - menuHeight - 8)),
    };
  }, [contextMenu]);

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length === 0) return;

    const textFiles = droppedFiles.filter((file) =>
      ['.tex', '.bib'].some((ext) => file.name.toLowerCase().endsWith(ext)),
    );
    const imageFiles = droppedFiles.filter((file) =>
      IMAGE_EXTS.some((ext) => file.name.toLowerCase().endsWith(ext)),
    );

    if (textFiles.length > 0 && onFilesImport) {
      const parsed = await Promise.all(
        textFiles.map(async (file) => ({
          name: file.name,
          content: await file.text(),
        })),
      );
      onFilesImport(parsed);
    }

    if (imageFiles.length > 0 && onImagesImport) {
      const parsed = imageFiles.map((file) => ({
        name: file.name,
        data: file,
        type: file.type,
      }));
      onImagesImport(parsed);
    }
  };

  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const handleContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, fileId: id });
  };

  return (
    <aside
      className={`w-full bg-primary-900 flex flex-col h-full shrink-0 font-sans relative ${
        isDragging ? 'border-2 border-blue-500 border-dashed' : ''
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setIsDragging(false);
      }}
      onDrop={handleDrop}
    >
      <div className="h-[40px] bg-primary-800 border-b border-primary-800 flex items-center justify-between px-4 text-xs font-medium text-primary-100 shrink-0">
        <span>Explorer</span>
        {onClose && (
          <button
            onClick={onClose}
            className="text-primary-500 hover:text-primary-100 transition-colors"
            title="Close Explorer"
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
        )}
      </div>

      <div className="py-3 flex-1 overflow-y-auto">
        <div className="py-1.5 px-4 text-xs font-semibold tracking-wider flex items-center gap-2 text-primary-500 mb-1">
          <svg
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            className="w-3.5 h-3.5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M19 9l-7 7-7-7"
            />
          </svg>
          PROJECT FILES
        </div>

        <div className="flex flex-col gap-0.5 px-2">
          {files.map((file) => {
            const isImage = getFileType(file.name) === 'image';

            return (
              <div
                key={file.id}
                onClick={() => {
                  if (isImage) {
                    onImageSelect?.(file.name);
                    return;
                  }
                  onSelectFile(file.id);
                }}
                onDoubleClick={() => {
                  if (isImage) {
                    onInsertImageLatex?.(file.name);
                  }
                }}
                onContextMenu={(e) => handleContextMenu(e, file.id)}
                className={`px-3 py-1.5 text-[13px] rounded-md cursor-pointer flex items-center gap-2.5 transition-colors ${
                  activeFileId === file.id
                    ? 'bg-primary-600 text-white font-medium'
                    : 'text-primary-500 hover:bg-primary-800 hover:text-primary-100'
                }`}
              >
                {isImage ? (
                  <ImageIcon className="w-4 h-4 opacity-80 shrink-0" />
                ) : (
                  <FileText className="w-4 h-4 opacity-80 shrink-0" />
                )}
                <span className="truncate">{file.name}</span>
              </div>
            );
          })}
        </div>
      </div>

      {contextMenu && menuPosition && (
        <div
          className="fixed z-50 bg-[#2a2a2a] border border-[#3d3d3d] rounded-xl shadow-2xl py-1.5 min-w-[180px] font-sans flex flex-col"
          style={{ top: menuPosition.y, left: menuPosition.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="flex items-center gap-3 px-4 py-2 hover:bg-[#353535] text-sm text-primary-100 transition-colors cursor-pointer text-left"
            onClick={() => {
              const file = files.find((item) => item.id === contextMenu.fileId);
              const newName = window.prompt('输入新的文件名', file?.name);
              if (newName?.trim() && onRenameFile) {
                onRenameFile(contextMenu.fileId, newName.trim());
              }
              setContextMenu(null);
            }}
          >
            重命名文件
          </button>

          <button
            className="flex items-center gap-3 px-4 py-2 hover:bg-[#353535] text-sm text-primary-100 transition-colors cursor-pointer text-left"
            onClick={() => {
              onDownloadFile?.(contextMenu.fileId);
              setContextMenu(null);
            }}
          >
            下载文件
          </button>

          <button
            className="flex items-center gap-3 px-4 py-2 hover:bg-[#353535] text-sm text-red-400 transition-colors cursor-pointer text-left"
            onClick={() => {
              if (onDeleteFile && window.confirm('确定要删除此文件吗？此操作不可撤销。')) {
                onDeleteFile(contextMenu.fileId);
              }
              setContextMenu(null);
            }}
          >
            删除文件
          </button>
        </div>
      )}
    </aside>
  );
};

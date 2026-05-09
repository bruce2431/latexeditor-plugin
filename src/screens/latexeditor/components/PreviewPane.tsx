import React, { useEffect, useMemo, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import pdfWorker from 'react-pdf/node_modules/pdfjs-dist/build/pdf.worker.min.mjs?url';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import {
  AlertCircle,
  AlertTriangle,
  Bug,
  FileText,
  Image as ImageIcon,
  Info,
  Loader2,
  Maximize2,
  TerminalSquare,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

interface CompileError {
  line?: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

interface PreviewPaneProps {
  pdfUrl?: string;
  logs?: string;
  isLoading?: boolean;
  errors: CompileError[];
  onErrorClick?: (line: number) => void;
  onPdfClick?: (page: number, x: number, y: number) => void;
  selectedImage?: { name: string; dataUrl: string } | null;
  onImageClose?: () => void;
}

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

const pdfOptions = {
  disableAutoFetch: true,
  disableStream: true,
};

export const PreviewPane: React.FC<PreviewPaneProps> = ({
  pdfUrl,
  logs,
  isLoading,
  errors = [],
  onErrorClick,
  onPdfClick,
  selectedImage,
  onImageClose,
}) => {
  const [showLogs, setShowLogs] = useState(false);
  const [viewMode, setViewMode] = useState<'pdf' | 'logs' | 'image'>('pdf');
  const [imageScale, setImageScale] = useState<number | 'fit'>(1);
  const errorCount = errors.filter((error) => error.severity === 'error').length;

  useEffect(() => {
    if (errors.some((error) => error.severity === 'error')) {
      setViewMode('logs');
    }
  }, [errors]);

  useEffect(() => {
    if (pdfUrl && errors.length === 0) {
      setViewMode('pdf');
    }
  }, [pdfUrl, errors]);

  useEffect(() => {
    if (selectedImage) {
      setViewMode('image');
      setImageScale('fit');
      return;
    }

    setViewMode(pdfUrl ? 'pdf' : 'logs');
  }, [selectedImage, pdfUrl]);

  const handleCloseImage = () => {
    setViewMode(pdfUrl ? 'pdf' : 'logs');
    onImageClose?.();
  };

  return (
    <section className="flex flex-col h-full bg-[#525659] font-sans">
      <div className="h-[40px] bg-primary-800 border-b border-primary-800 flex items-center justify-between px-4 text-xs font-medium text-primary-100 shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setViewMode('pdf')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
              viewMode === 'pdf'
                ? 'bg-primary-700 text-white'
                : 'text-primary-500 hover:text-primary-100 hover:bg-primary-800'
            }`}
          >
            <FileText className="w-4 h-4" />
            PDF 预览
            {errorCount > 0 && (
              <span className="ml-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold">
                {errorCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setViewMode('logs')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
              viewMode === 'logs'
                ? 'bg-primary-700 text-white'
                : 'text-primary-500 hover:text-primary-100 hover:bg-primary-800'
            }`}
          >
            <TerminalSquare className="w-4 h-4" />
            编译日志
          </button>

          {selectedImage && (
            <button
              onClick={() => setViewMode('image')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                viewMode === 'image'
                  ? 'bg-primary-700 text-white'
                  : 'text-primary-500 hover:text-primary-100 hover:bg-primary-800'
              }`}
            >
              <ImageIcon className="w-4 h-4" />
              图片预览
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {viewMode === 'pdf' && (
            <button
              onClick={() => setShowLogs((prev) => !prev)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors text-xs font-medium cursor-pointer ${
                showLogs
                  ? 'bg-primary-600 text-white'
                  : 'hover:bg-primary-800 text-primary-500 hover:text-primary-100'
              }`}
            >
              <TerminalSquare className="w-4 h-4" />
              {showLogs ? 'Hide Logs' : 'Show Logs'}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative flex flex-col">
        {showLogs && logs && viewMode === 'pdf' ? (
          <div className="absolute inset-0 z-20 bg-primary-950 p-4 overflow-auto text-xs font-mono text-primary-300 border-t border-primary-800 shadow-inner">
            <pre className="whitespace-pre-wrap">{logs}</pre>
          </div>
        ) : null}

        {viewMode === 'pdf' ? (
          pdfUrl ? (
            <div className="absolute inset-0 w-full h-full z-10 bg-[#525659]">
              <PdfPreview
                pdfUrl={pdfUrl}
                onPdfClick={onPdfClick}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-primary-500 gap-4 p-8 text-center">
              {isLoading ? (
                <>
                  <Loader2 className="w-12 h-12 animate-spin opacity-50" />
                  <p>Compiling document...</p>
                </>
              ) : logs && !pdfUrl ? (
                <>
                  <AlertCircle className="w-12 h-12 text-red-500 opacity-80" />
                  <p className="text-red-400">Compilation failed. Please check the logs.</p>
                  <button
                    onClick={() => setViewMode('logs')}
                    className="px-4 py-2 mt-2 bg-primary-800 hover:bg-primary-700 text-primary-100 rounded-md transition-colors text-sm"
                  >
                    View Compilation Logs
                  </button>
                </>
              ) : (
                <>
                  <FileText className="w-12 h-12 opacity-20" />
                  <p>Click "Compile" to generate PDF preview</p>
                </>
              )}
            </div>
          )
        ) : viewMode === 'logs' ? (
          <LogViewer logs={logs || ''} errors={errors} onErrorClick={onErrorClick} />
        ) : viewMode === 'image' && selectedImage ? (
          <ImagePreview
            selectedImage={selectedImage}
            imageScale={imageScale}
            onScaleChange={setImageScale}
            onClose={handleCloseImage}
          />
        ) : null}
      </div>
    </section>
  );
};

const PdfPreview: React.FC<{
  pdfUrl: string;
  onPdfClick?: (page: number, x: number, y: number) => void;
}> = ({ pdfUrl, onPdfClick }) => {
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.15);
  const [pageSizes, setPageSizes] = useState<Record<number, { width: number; height: number }>>({});
  const [syncHint, setSyncHint] = useState('Click PDF content to jump to source');
  const [loadError, setLoadError] = useState<string | null>(null);
  const pdfFile = useMemo(() => ({ url: pdfUrl }), [pdfUrl]);

  useEffect(() => {
    setNumPages(0);
    setPageSizes({});
    setLoadError(null);
  }, [pdfUrl]);

  const handlePageClick = (pageNumber: number, event: React.MouseEvent<HTMLDivElement>) => {
    if (!onPdfClick) return;

    const size = pageSizes[pageNumber];
    if (!size) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * size.width;
    const y = size.height - ((event.clientY - rect.top) / rect.height) * size.height;

    setSyncHint(`Locating source: page ${pageNumber}`);
    onPdfClick(pageNumber, x, y);
    window.setTimeout(() => setSyncHint('Click PDF content to jump to source'), 1600);
  };

  return (
    <div className="h-full w-full flex flex-col bg-[#525659]">
      <div className="h-10 shrink-0 bg-[#3f4247] border-b border-black/20 flex items-center justify-between px-3 text-xs text-white/80">
        <span>{syncHint}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setScale((value) => Math.max(0.6, value - 0.1))}
            className="p-1.5 rounded hover:bg-white/10 transition-colors"
            title="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="w-12 text-center">{Math.round(scale * 100)}%</span>
          <button
            type="button"
            onClick={() => setScale((value) => Math.min(2.4, value + 0.1))}
            className="p-1.5 rounded hover:bg-white/10 transition-colors"
            title="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <Document
          file={pdfFile}
          options={pdfOptions}
          loading={
            <div className="h-full flex items-center justify-center text-white/70 gap-3">
              <Loader2 className="w-5 h-5 animate-spin" />
              Loading PDF...
            </div>
          }
          error={
            <div className="mx-auto max-w-xl rounded-lg border border-red-400/30 bg-red-950/30 p-4 text-red-100 text-sm">
              <div className="font-semibold mb-2">Failed to load PDF preview.</div>
              {loadError && <pre className="whitespace-pre-wrap text-xs text-red-200">{loadError}</pre>}
            </div>
          }
          onLoadSuccess={({ numPages }) => {
            setLoadError(null);
            setNumPages(numPages);
          }}
          onLoadError={(error) => {
            console.error('[PDF preview] load failed:', error);
            setLoadError(error?.message || String(error));
          }}
        >
          <div className="flex flex-col items-center gap-6">
            {Array.from({ length: numPages }, (_, index) => {
              const pageNumber = index + 1;
              return (
                <div
                  key={pageNumber}
                  role="button"
                  tabIndex={0}
                  className="shadow-2xl bg-white cursor-crosshair"
                  title="Click to jump to source"
                  onClick={(event) => handlePageClick(pageNumber, event)}
                >
                  <Page
                    pageNumber={pageNumber}
                    scale={scale}
                    renderAnnotationLayer
                    renderTextLayer
                    onLoadSuccess={(page) => {
                      const viewport = page.getViewport({ scale: 1 });
                      setPageSizes((prev) => ({
                        ...prev,
                        [pageNumber]: { width: viewport.width, height: viewport.height },
                      }));
                    }}
                  />
                </div>
              );
            })}
          </div>
        </Document>
      </div>
    </div>
  );
};

const LogViewer: React.FC<{
  logs: string;
  errors: CompileError[];
  onErrorClick?: (line: number) => void;
}> = ({ logs, errors, onErrorClick }) => {
  const [showRawLogs, setShowRawLogs] = useState(true);

  const grouped = errors.reduce<Record<'error' | 'warning' | 'info', CompileError[]>>(
    (acc, error) => {
      acc[error.severity].push(error);
      return acc;
    },
    { error: [], warning: [], info: [] },
  );

  return (
    <div className="flex-1 overflow-auto bg-primary-950 p-5 font-sans">
      <div className="mb-6">
        {grouped.error.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 text-red-400 mb-2">
              <Bug className="w-4 h-4" />
              <span className="font-semibold text-sm">错误 ({grouped.error.length})</span>
            </div>
            {grouped.error.map((error, idx) => (
              <button
                key={`error-${idx}`}
                type="button"
                className={`ml-6 mb-2 text-xs block text-left w-[calc(100%-1.5rem)] rounded px-2 py-1 ${
                  error.line ? 'cursor-pointer hover:bg-red-500/10' : ''
                }`}
                onClick={() => {
                  if (error.line) onErrorClick?.(error.line);
                }}
              >
                {error.line && <span className="text-red-500 mr-2">第 {error.line} 行</span>}
                <span className="text-primary-300">{error.message}</span>
              </button>
            ))}
          </div>
        )}

        {grouped.warning.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 text-yellow-400 mb-2">
              <AlertTriangle className="w-4 h-4" />
              <span className="font-semibold text-sm">警告 ({grouped.warning.length})</span>
            </div>
            {grouped.warning.map((error, idx) => (
              <button
                key={`warning-${idx}`}
                type="button"
                className={`ml-6 mb-2 text-xs block text-left w-[calc(100%-1.5rem)] rounded px-2 py-1 ${
                  error.line ? 'cursor-pointer hover:bg-yellow-500/10' : ''
                }`}
                onClick={() => {
                  if (error.line) onErrorClick?.(error.line);
                }}
              >
                {error.line && <span className="text-yellow-500 mr-2">第 {error.line} 行</span>}
                <span className="text-primary-300">{error.message}</span>
              </button>
            ))}
          </div>
        )}

        {grouped.info.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 text-primary-500 mb-2">
              <Info className="w-4 h-4" />
              <span className="font-semibold text-sm">信息 ({grouped.info.length})</span>
            </div>
            {grouped.info.map((error, idx) => (
              <div key={`info-${idx}`} className="ml-6 mb-2 text-xs text-primary-400 px-2 py-1">
                {error.line && <span className="mr-2">第 {error.line} 行</span>}
                <span>{error.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {showRawLogs ? (
        <div className="border-t border-primary-800 pt-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-primary-100">原始日志</span>
            <button
              onClick={() => setShowRawLogs(false)}
              className="text-xs text-primary-500 hover:text-primary-300 transition-colors"
            >
              隐藏
            </button>
          </div>
          <pre className="whitespace-pre-wrap text-xs font-mono text-primary-400 bg-primary-900 p-4 rounded-lg border border-primary-800 max-h-96 overflow-auto">
            {logs}
          </pre>
        </div>
      ) : (
        <button
          onClick={() => setShowRawLogs(true)}
          className="text-xs text-primary-500 hover:text-primary-300 transition-colors mt-2"
        >
          显示原始日志
        </button>
      )}
    </div>
  );
};

interface ImagePreviewProps {
  selectedImage: { name: string; dataUrl: string };
  imageScale: number | 'fit';
  onScaleChange: (scale: number | 'fit') => void;
  onClose: () => void;
}

const ImagePreview: React.FC<ImagePreviewProps> = ({
  selectedImage,
  imageScale,
  onScaleChange,
  onClose,
}) => {
  const handleZoomIn = () => {
    if (imageScale === 'fit') {
      onScaleChange(1);
      return;
    }
    onScaleChange(Math.min(imageScale * 1.2, 5));
  };

  const handleZoomOut = () => {
    if (imageScale === 'fit') {
      onScaleChange(0.8);
      return;
    }
    onScaleChange(Math.max(imageScale * 0.8, 0.1));
  };

  return (
    <div className="flex-1 overflow-hidden bg-primary-950 flex flex-col">
      <div className="h-12 bg-primary-800 border-b border-primary-800 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-primary-100 truncate max-w-md">
            {selectedImage.name}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleZoomOut}
            className="p-1.5 rounded-md hover:bg-primary-700 text-primary-300 hover:text-primary-100 transition-colors"
            title="缩小"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={() => onScaleChange('fit')}
            className="p-1.5 rounded-md hover:bg-primary-700 text-primary-300 hover:text-primary-100 transition-colors"
            title="适应窗口"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            onClick={handleZoomIn}
            className="p-1.5 rounded-md hover:bg-primary-700 text-primary-300 hover:text-primary-100 transition-colors"
            title="放大"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <div className="w-px h-4 bg-primary-700 mx-1" />
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-red-500/20 text-primary-300 hover:text-red-400 transition-colors"
            title="关闭图片预览"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-primary-900 flex items-center justify-center p-4">
        <img
          src={selectedImage.dataUrl}
          alt={selectedImage.name}
          className={`max-w-full max-h-full object-contain transition-transform duration-200 ${
            imageScale === 'fit' ? '' : 'transform'
          }`}
          style={{
            transform: imageScale === 'fit' ? undefined : `scale(${imageScale})`,
            transformOrigin: 'center center',
          }}
        />
      </div>

      <div className="h-8 bg-primary-800 border-t border-primary-800 flex items-center justify-center text-xs text-primary-400">
        {imageScale === 'fit' ? '适应窗口' : `缩放: ${Math.round(imageScale * 100)}%`}
      </div>
    </div>
  );
};

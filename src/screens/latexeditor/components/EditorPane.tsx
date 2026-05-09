import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { EditorState, StateField, StateEffect } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine, Decoration, DecorationSet } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { latex } from 'codemirror-lang-latex';
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import * as Diff from 'diff';

interface EditorPaneProps {
  content: string;
  onChange: (content: string) => void;
  onCursorChange?: (pos: number) => void;
  onCtrlM?: (pos: { top: number, left: number }, selectedText: string, from: number, to: number) => void;
  pendingAiCode?: string | null;
  onClearPendingAiCode?: () => void;
}

export interface EditorPaneRef {
  jumpToLine: (line: number) => void;
  insertText: (text: string) => void;
}

const addMark = Decoration.mark({ class: "bg-green-500/20 text-green-300" });
const removeMark = Decoration.mark({ class: "bg-red-500/20 text-red-300 line-through" });

const diffEffect = StateEffect.define<{ added: [number, number][], removed: [number, number][] }>();
const diffField = StateField.define<DecorationSet>({
  create() { return Decoration.none; },
  update(decorations, tr) {
    decorations = decorations.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(diffEffect)) {
        let builder = [];
        for (const [from, to] of e.value.added) builder.push(addMark.range(from, to));
        for (const [from, to] of e.value.removed) builder.push(removeMark.range(from, to));
        builder.sort((a, b) => a.from - b.from);
        decorations = Decoration.set(builder);
      }
    }
    return decorations;
  },
  provide: f => EditorView.decorations.from(f)
});

const ideTheme = EditorView.theme({
  "&": {
    fontSize: '14px',
    fontFamily: 'var(--font-mono)',
    backgroundColor: 'var(--color-primary-900)',
    color: 'var(--color-primary-100)',
    height: '100%'
  },
  ".cm-scroller": { overflow: 'auto' },
  ".cm-content": { caretColor: '#fff' },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: '#fff' },
  ".cm-selectionBackground, .cm-content ::selection": { 
    backgroundColor: 'rgba(59, 130, 246, 0.5) !important'
  },
  ".cm-searchMatch": {
    backgroundColor: "rgba(245, 158, 11, 0.3)",
    outline: "1px solid #F59E0B"
  },
  ".cm-searchMatch.cm-searchMatch-selected": {
    backgroundColor: "rgba(245, 158, 11, 0.5)"
  },
  ".cm-activeLine": { backgroundColor: "rgba(255, 255, 255, 0.03)" },
  ".cm-selectionMatch": { backgroundColor: "rgba(16, 185, 129, 0.2)" },
  "&.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket": {
    backgroundColor: "rgba(255, 255, 255, 0.1)"
  },
  ".cm-gutters": {
    backgroundColor: "var(--color-primary-900)",
    color: "var(--color-primary-500)",
    borderRight: "1px solid var(--color-primary-800)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    color: "var(--color-primary-300)"
  },
  ".cm-lineNumbers": {
    fontFamily: "var(--font-mono)",
    fontSize: "13px",
    paddingRight: "8px"
  },
  ".cm-foldGutter": {
    width: "16px"
  },
  ".cm-tooltip": {
    backgroundColor: "var(--color-primary-800)",
    border: "1px solid var(--color-primary-700)",
    color: "var(--color-primary-100)",
    borderRadius: "6px",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)"
  },
  ".cm-completionIcon": {
    fontSize: "12px",
    marginRight: "4px"
  },
  ".cm-completionLabel": {
    fontFamily: "var(--font-sans)",
    fontSize: "13px"
  },
  ".cm-completionDetail": {
    fontFamily: "var(--font-sans)",
    fontSize: "11px",
    color: "var(--color-primary-500)"
  }
});

const latexHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: "#F472B6" },
  { tag: t.comment, color: "#6B7280", fontStyle: "italic" },
  { tag: t.string, color: "#10B981" },
  { tag: t.number, color: "#F59E0B" },
  { tag: t.bracket, color: "#93C5FD" },
  { tag: t.tagName, color: "#8B5CF6" },
  { tag: t.attributeName, color: "#F59E0B" },
  { tag: t.attributeValue, color: "#10B981" },
  { tag: t.meta, color: "#6B7280" },
]);

export const EditorPane = forwardRef<EditorPaneRef, EditorPaneProps>(({
  content,
  onChange,
  onCursorChange,
  onCtrlM,
  pendingAiCode,
  onClearPendingAiCode
}, ref) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [lastContent, setLastContent] = useState(content);
  const [showDiff, setShowDiff] = useState(false);
  
  const [isReviewMode, setIsReviewMode] = useState(false);
  const [diffStats, setDiffStats] = useState({ added: 0, removed: 0 });
  const reviewModeRef = useRef(false);
  
  const pendingAiCodeRef = useRef(pendingAiCode);
  const contentRef = useRef(content);
  const onChangeRef = useRef(onChange);
  const onCursorChangeRef = useRef(onCursorChange);
  const onCtrlMRef = useRef(onCtrlM);
  const applyingExternalChangeRef = useRef(false);
  
  useImperativeHandle(ref, () => ({
    jumpToLine: (line: number) => {
      if (!viewRef.current) return;
      const doc = viewRef.current.state.doc;
      const safeLine = Math.max(1, Math.min(line, doc.lines));
      const linePos = doc.line(safeLine);
      viewRef.current.dispatch({
        selection: { anchor: linePos.from },
        scrollIntoView: true
      });
      viewRef.current.dispatch({
        effects: EditorView.scrollIntoView(linePos.from, { y: 'center' })
      });
    },
    insertText: (text: string) => {
      if (!viewRef.current) return;
      const cursorPos = viewRef.current.state.selection.main.head;
      viewRef.current.dispatch({
        changes: { from: cursorPos, to: cursorPos, insert: text },
        selection: { anchor: cursorPos + text.length }
      });
    }
  }));

  useEffect(() => {
    pendingAiCodeRef.current = pendingAiCode;
    contentRef.current = content;
    onChangeRef.current = onChange;
    onCursorChangeRef.current = onCursorChange;
    onCtrlMRef.current = onCtrlM;
  }, [pendingAiCode, content, onChange, onCursorChange, onCtrlM]);

  useEffect(() => {
    if (pendingAiCode && viewRef.current) {
      setIsReviewMode(true);
      reviewModeRef.current = true;
      const normalizedContent = content.replace(/\r\n/g, '\n');
      const normalizedPending = pendingAiCode.replace(/\r\n/g, '\n');
      
      const diffs = Diff.diffWords(normalizedContent, normalizedPending);
      let woven = '';
      let added: [number, number][] = [];
      let removed: [number, number][] = [];
      let pos = 0;
      let totalAdd = 0;
      let totalRemove = 0;
      
      for (const part of diffs) {
        if (part.added) {
          added.push([pos, pos + part.value.length]);
          woven += part.value;
          pos += part.value.length;
          totalAdd += part.value.split(/\s+/).length;
        } else if (part.removed) {
          removed.push([pos, pos + part.value.length]);
          totalRemove += part.value.split(/\s+/).length;
        } else {
          woven += part.value;
          pos += part.value.length;
        }
      }
      
      setDiffStats({ added: totalAdd, removed: totalRemove });
      
      viewRef.current.dispatch({
        changes: { from: 0, to: viewRef.current.state.doc.length, insert: woven },
        effects: diffEffect.of({ added, removed })
      });
      
      setShowDiff(true);
    }
  }, [pendingAiCode, content]);

  useEffect(() => {
    if (viewRef.current && content !== lastContent && !reviewModeRef.current) {
      viewRef.current.dispatch({
        effects: diffEffect.of({ added: [], removed: [] })
      });
      setShowDiff(false);
      setLastContent(content);
    }
  }, [content, lastContent]);

  const acceptChanges = () => {
    if (viewRef.current && pendingAiCodeRef.current) {
      const pureCode = pendingAiCodeRef.current.replace(/\r\n/g, '\n');
      viewRef.current.dispatch({
        changes: { from: 0, to: viewRef.current.state.doc.length, insert: pureCode },
        effects: diffEffect.of({ added: [], removed: [] })
      });
      setIsReviewMode(false);
      reviewModeRef.current = false;
      if (onClearPendingAiCode) onClearPendingAiCode();
      onChange(pureCode);
    }
  };

  const rejectChanges = () => {
    if (viewRef.current) {
      const normalizedContent = contentRef.current.replace(/\r\n/g, '\n');
      viewRef.current.dispatch({
        changes: { from: 0, to: viewRef.current.state.doc.length, insert: normalizedContent },
        effects: diffEffect.of({ added: [], removed: [] })
      });
      setIsReviewMode(false);
      reviewModeRef.current = false;
      if (onClearPendingAiCode) onClearPendingAiCode();
      onChange(normalizedContent);
    }
  };

  useEffect(() => {
    if (!editorRef.current) return;

    const startState = EditorState.create({
      doc: content,
      extensions: [
        ideTheme,
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        drawSelection(),
        dropCursor(),
        rectangularSelection(),
        crosshairCursor(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        latex(),
        syntaxHighlighting(latexHighlightStyle),
        diffField,
        EditorView.updateListener.of(update => {
          if (update.docChanged) {
            if (applyingExternalChangeRef.current) {
              applyingExternalChangeRef.current = false;
              return;
            }
            const newContent = update.state.doc.toString();
            onChangeRef.current(newContent);
          }
          if (update.selectionSet && onCursorChangeRef.current) {
            const pos = update.state.selection.main.head;
            onCursorChangeRef.current(pos);
          }
        }),
        keymap.of([
          {
            key: "Ctrl-m",
            run: (view) => {
              const selection = view.state.selection.main;
              const selectedText = view.state.sliceDoc(selection.from, selection.to);
              
              if (selectedText && onCtrlMRef.current) {
                const coords = view.coordsAtPos(selection.from);
                if (coords) {
                  const rect = editorRef.current!.getBoundingClientRect();
                  onCtrlMRef.current(
                    { 
                      top: coords.top - rect.top + 20, 
                      left: coords.left - rect.left 
                    }, 
                    selectedText, 
                    selection.from, 
                    selection.to
                  );
                }
              }
              return true;
            }
          }
        ]),
        keymap.of([
          {
            key: "Mod-y",
            run: () => {
              if (reviewModeRef.current && pendingAiCodeRef.current) {
                const pureCode = pendingAiCodeRef.current.replace(/\r\n/g, '\n');
                if (viewRef.current) {
                  viewRef.current.dispatch({
                    changes: { from: 0, to: viewRef.current.state.doc.length, insert: pureCode },
                    effects: diffEffect.of({ added: [], removed: [] })
                  });
                  setIsReviewMode(false);
                  reviewModeRef.current = false;
                  if (onClearPendingAiCode) onClearPendingAiCode();
                  onChange(pureCode);
                }
                return true;
              }
              return false;
            }
          },
          {
            key: "Mod-n",
            run: () => {
              if (reviewModeRef.current && pendingAiCodeRef.current) {
                const normalizedContent = contentRef.current.replace(/\r\n/g, '\n');
                if (viewRef.current) {
                  viewRef.current.dispatch({
                    changes: { from: 0, to: viewRef.current.state.doc.length, insert: normalizedContent },
                    effects: diffEffect.of({ added: [], removed: [] })
                  });
                  setIsReviewMode(false);
                  reviewModeRef.current = false;
                  if (onClearPendingAiCode) onClearPendingAiCode();
                  onChange(normalizedContent);
                }
                return true;
              }
              return false;
            }
          }
        ])
      ]
    });

    const view = new EditorView({
      state: startState,
      parent: editorRef.current
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (viewRef.current && content !== viewRef.current.state.doc.toString()) {
      applyingExternalChangeRef.current = true;
      viewRef.current.dispatch({
        changes: {
          from: 0,
          to: viewRef.current.state.doc.length,
          insert: content
        }
      });
    }
  }, [content]);

  return (
    <div className="h-full flex flex-col bg-primary-900 relative">
      <div className="h-8 bg-primary-800 border-b border-primary-800 flex items-center justify-between px-3 text-xs text-primary-400">
        <div className="flex items-center gap-2">
          <span>LaTeX</span>
          {showDiff && (
            <span className="px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 rounded text-[10px]">
              显示差异
            </span>
          )}
          {isReviewMode && (
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-gray-400">撤销 Ctrl+N</span>
              <span className="text-[11px] text-green-400">保留 Ctrl+Y</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px]">UTF-8</span>
          <span className="text-[10px]">LF</span>
        </div>
      </div>
      <div ref={editorRef} className="flex-1 overflow-hidden" />
      
      {isReviewMode && (
        <div className="absolute bottom-6 mx-auto left-0 right-0 z-10 bg-[#1e1e1e] border border-[#2d2d2d] rounded-xl shadow-2xl w-[80%] max-w-[600px] p-3 font-sans text-primary-100 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">合并更改 <span className="text-gray-500 text-xs font-normal">auto-apply pending</span></span>
            <div className="flex items-center gap-4 text-xs">
              <button onClick={rejectChanges} className="text-gray-400 hover:text-red-400 transition-colors cursor-pointer">全部撤销</button>
              <button onClick={acceptChanges} className="text-gray-400 hover:text-green-400 transition-colors cursor-pointer">全部保留</button>
              <svg fill="currentColor" viewBox="0 0 24 24" className="w-3 h-3 text-gray-500"><path d="M7 10l5 5 5-5z"/></svg>
            </div>
          </div>
          <div className="flex items-center justify-between text-xs text-gray-400 bg-black/20 p-2 rounded">
            <span>{`{}`} main.tex: modified</span>
            <span className="flex items-center gap-3">
              <span className="text-green-500">+{diffStats.added}</span>
              <span className="text-red-500">-{diffStats.removed}</span>
              <span className="bg-[#2d2d2d] px-2 py-0.5 rounded text-gray-300">审查</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
});

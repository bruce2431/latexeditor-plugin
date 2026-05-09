import { useState, useCallback } from 'react';
import { EditorSettings, EditorViewMode } from '../types/latex';

export function useLatexEditor() {
  const [settings, setSettings] = useState<EditorSettings>({
    fontSize: 14,
    wordWrap: true,
    showExplorer: true,
    showEditor: true,
    showPreview: true,
    autoCompile: true,
  });

  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [cursorPosition, setCursorPosition] = useState<number>(0);

  const updateSettings = useCallback((newSettings: Partial<EditorSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  }, []);

  const togglePanel = useCallback((panel: 'showExplorer' | 'showEditor' | 'showPreview') => {
    setSettings(prev => ({ ...prev, [panel]: !prev[panel] }));
  }, []);

  return {
    settings,
    updateSettings,
    togglePanel,
    activeFileId,
    setActiveFileId,
    cursorPosition,
    setCursorPosition,
  };
}

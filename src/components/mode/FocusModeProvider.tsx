'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { FocusMode } from '@/types';

type FocusModeContextValue = {
  focusMode: FocusMode;
  setFocusMode: (mode: FocusMode) => void;
  loading: boolean;
};

const FocusModeContext = createContext<FocusModeContextValue | undefined>(undefined);
const STORAGE_KEY = 'lyt-focus-mode';

const applyDocumentTheme = (mode: FocusMode) => {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.focusMode = mode;
};

export function FocusModeProvider({ children }: { children: ReactNode }) {
  const [focusMode, setFocusModeState] = useState<FocusMode>(() => {
    if (typeof window === 'undefined') {
      return 'CORPORATE';
    }
    const stored = localStorage.getItem(STORAGE_KEY) as FocusMode | null;
    const initialMode: FocusMode =
      stored === 'HOLISTIC' || stored === 'CORPORATE' ? stored : 'CORPORATE';
    applyDocumentTheme(initialMode);
    return initialMode;
  });
  const loading = false;

  const handleSetFocusMode = (mode: FocusMode) => {
    setFocusModeState(mode);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, mode);
    }
    applyDocumentTheme(mode);
  };

  const value = useMemo(
    () => ({
      focusMode,
      setFocusMode: handleSetFocusMode,
      loading,
    }),
    [focusMode, loading],
  );

  return <FocusModeContext.Provider value={value}>{children}</FocusModeContext.Provider>;
}

export const useFocusMode = (): FocusModeContextValue => {
  const context = useContext(FocusModeContext);
  if (!context) {
    throw new Error('useFocusMode must be used within a FocusModeProvider');
  }
  return context;
};

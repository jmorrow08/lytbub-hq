'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
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
  const [focusMode, setFocusModeState] = useState<FocusMode>('CORPORATE');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored =
      typeof window !== 'undefined' ? (localStorage.getItem(STORAGE_KEY) as FocusMode | null) : null;
    if (stored === 'HOLISTIC' || stored === 'CORPORATE') {
      setFocusModeState(stored);
      applyDocumentTheme(stored);
    }
    setLoading(false);
  }, []);

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
    [focusMode, loading]
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

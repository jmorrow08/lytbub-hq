'use client';

import { Sparkles, Briefcase } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFocusMode } from './FocusModeProvider';
import type { FocusMode } from '@/types';

const labels: Record<FocusMode, { title: string; description: string; icon: typeof Briefcase }> = {
  CORPORATE: {
    title: 'Corporate',
    description: 'Bonus Hunter mode',
    icon: Briefcase,
  },
  HOLISTIC: {
    title: 'Holistic',
    description: 'Zen Guard mode',
    icon: Sparkles,
  },
};

export function ModeToggle() {
  const { focusMode, setFocusMode, loading } = useFocusMode();

  if (loading) return null;

  return (
    <div className="flex items-center gap-2 rounded-full border bg-muted/60 px-1 py-1">
      {(['CORPORATE', 'HOLISTIC'] as FocusMode[]).map((mode) => {
        const Icon = labels[mode].icon;
        const active = focusMode === mode;
        return (
          <Button
            key={mode}
            variant={active ? 'default' : 'ghost'}
            size="sm"
            className="gap-2 rounded-full px-3"
            onClick={() => setFocusMode(mode)}
            aria-pressed={active}
          >
            <Icon className="h-4 w-4" />
            <span className="text-sm font-semibold">{labels[mode].title}</span>
          </Button>
        );
      })}
    </div>
  );
}

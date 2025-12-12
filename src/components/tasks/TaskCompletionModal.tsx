'use client';

import { useEffect, useState } from 'react';
import type { FocusMode } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export type CompletionDetails =
  | {
      mode: 'CORPORATE';
      financialImpact: string;
      skillDemonstrated: string;
      kudosReceived: string;
    }
  | {
      mode: 'HOLISTIC';
      feeling: string;
      interruptionReason: string;
    };

type Props = {
  open: boolean;
  mode: FocusMode;
  taskTitle?: string;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (details: CompletionDetails) => Promise<void> | void;
};

export function TaskCompletionModal(props: Props) {
  if (!props.open) return null;
  return <TaskCompletionModalContent {...props} />;
}

type ModalContentProps = Props;

function TaskCompletionModalContent({
  open,
  mode,
  taskTitle,
  loading,
  onClose,
  onSubmit,
}: ModalContentProps) {
  const [financialImpact, setFinancialImpact] = useState('');
  const [skill, setSkill] = useState('');
  const [kudos, setKudos] = useState('');
  const [feeling, setFeeling] = useState('');
  const [interruptionReason, setInterruptionReason] = useState('');

  useEffect(() => {
    if (!open) return;
    // Use setTimeout to avoid synchronous setState in effect
    setTimeout(() => {
      setFinancialImpact('');
      setSkill('');
      setKudos('');
      setFeeling('');
      setInterruptionReason('');
    }, 0);
  }, [open, mode]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'CORPORATE') {
      onSubmit({
        mode: 'CORPORATE',
        financialImpact: financialImpact.trim(),
        skillDemonstrated: skill.trim(),
        kudosReceived: kudos.trim(),
      });
    } else {
      onSubmit({
        mode: 'HOLISTIC',
        feeling: feeling.trim(),
        interruptionReason: interruptionReason.trim(),
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-lg rounded-lg bg-background shadow-2xl">
        <div className="flex items-start justify-between border-b px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {mode === 'CORPORATE' ? 'Bonus Hunter' : 'Zen Guard'}
            </p>
            <h2 className="text-xl font-semibold">Complete task</h2>
            {taskTitle && <p className="text-sm text-muted-foreground mt-1">{taskTitle}</p>}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          {mode === 'CORPORATE' ? (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">What was the business impact?</label>
                <textarea
                  value={financialImpact}
                  onChange={(e) => setFinancialImpact(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="e.g., Cleared outbound backlog before carrier cutoff; reduced mis-picks by ~15% this shift."
                  rows={3}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">What skill did you demonstrate?</label>
                <Input
                  value={skill}
                  onChange={(e) => setSkill(e.target.value)}
                  placeholder="e.g., Forklift ops, slotting/put-away optimization, pick/pack QA"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Any kudos or receipts?</label>
                <Input
                  value={kudos}
                  onChange={(e) => setKudos(e.target.value)}
                  placeholder="e.g., Shift lead shout-out; carrier team thanked us; QC noted zero damages"
                />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">How do you feel?</label>
                <textarea
                  value={feeling}
                  onChange={(e) => setFeeling(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="e.g., Calmer, more focused, 7/10 clarity"
                  rows={3}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Any interruptions to note?</label>
                <Input
                  value={interruptionReason}
                  onChange={(e) => setInterruptionReason(e.target.value)}
                  placeholder="Optional — meetings, notifications, etc."
                />
              </div>
            </>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : 'Save & Complete'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

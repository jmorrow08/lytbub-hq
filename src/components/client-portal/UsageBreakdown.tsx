'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

type UsageBreakdownItem = {
  label: string;
  description?: string;
  billedAmountCents?: number | null;
  billedAmount?: number | null;
  rawCostCents?: number | null;
  rawCost?: number | null;
  markupPercent?: number | null;
  meta?: ReactNode;
};

type UsageBreakdownProps = {
  items: UsageBreakdownItem[];
  emptyMessage?: string;
  highlightFirst?: boolean;
};

function toCurrency({ dollars, cents }: { dollars?: number | null; cents?: number | null }) {
  if (typeof dollars === 'number' && Number.isFinite(dollars)) {
    return currency.format(dollars);
  }
  if (typeof cents === 'number' && Number.isFinite(cents)) {
    return currency.format(cents / 100);
  }
  return null;
}

export function UsageBreakdown({
  items,
  emptyMessage = 'No usage found.',
  highlightFirst = false,
}: UsageBreakdownProps) {
  if (!items.length) {
    return <p className="text-xs text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((item, index) => {
        const billed = toCurrency({ dollars: item.billedAmount, cents: item.billedAmountCents });
        const raw = toCurrency({ dollars: item.rawCost, cents: item.rawCostCents });
        const markup =
          typeof item.markupPercent === 'number' && Number.isFinite(item.markupPercent)
            ? `${item.markupPercent}%`
            : null;
        const highlight = highlightFirst && index === 0;

        return (
          <div
            key={`${item.label}-${index}`}
            className={cn(
              'rounded-md border border-slate-800 bg-slate-950/60 p-3',
              highlight && 'border-primary/40 shadow-sm',
            )}
          >
            <div className="flex items-center justify-between text-sm font-semibold text-slate-100">
              <span>{item.label}</span>
              {billed && <span>{billed}</span>}
            </div>
            {item.description && (
              <p className="mt-1 text-xs text-slate-400 leading-relaxed">{item.description}</p>
            )}
            {(raw || markup || item.meta) && (
              <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                {raw && <span>Raw: {raw}</span>}
                {markup && <span>Markup: {markup}</span>}
                {item.meta}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

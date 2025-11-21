'use client';

import { useState } from 'react';
import type { BillingPeriod, Invoice } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type InvoiceBuilderProps = {
  billingPeriods: BillingPeriod[];
  onGenerate: (params: {
    billingPeriodId: string;
    includeProcessingFee: boolean;
    memo?: string;
  }) => Promise<void>;
  generating: boolean;
  draftInvoice?: Invoice | null;
};

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function InvoiceBuilder({ billingPeriods, onGenerate, generating, draftInvoice }: InvoiceBuilderProps) {
  const [billingPeriodId, setBillingPeriodId] = useState('');
  const [includeProcessingFee, setIncludeProcessingFee] = useState(true);
  const [memo, setMemo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!billingPeriodId) {
      setError('Select a billing period.');
      return;
    }
    try {
      await onGenerate({ billingPeriodId, includeProcessingFee, memo: memo.trim() || undefined });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate invoice.');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invoice Builder</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="invoice-period" className="block text-sm font-medium mb-1">
              Billing Period
            </label>
            <select
              id="invoice-period"
              value={billingPeriodId}
              onChange={(event) => setBillingPeriodId(event.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              required
            >
              <option value="">Select billing period</option>
              {billingPeriods.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.period_start} → {period.period_end} ({period.status})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="processing-fee"
              type="checkbox"
              className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
              checked={includeProcessingFee}
              onChange={(event) => setIncludeProcessingFee(event.target.checked)}
            />
            <label htmlFor="processing-fee" className="text-sm text-muted-foreground">
              Include processing fee line item for card payments
            </label>
          </div>

          <div>
            <label htmlFor="invoice-memo" className="block text-sm font-medium mb-1">
              Internal memo (optional)
            </label>
            <Input
              id="invoice-memo"
              placeholder="e.g., Include January bug fixes"
              value={memo}
              onChange={(event) => setMemo(event.target.value)}
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <Button type="submit" disabled={generating}>
            {generating ? 'Preparing invoice…' : 'Generate Draft Invoice'}
          </Button>
        </form>

        {draftInvoice && (
          <div className="rounded-lg border border-border/60 p-4 space-y-3 bg-muted/40">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Draft Invoice</p>
                <p className="text-lg font-semibold">{draftInvoice.invoice_number}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-xl font-bold">{currency.format(draftInvoice.total_cents / 100)}</p>
              </div>
            </div>
            {draftInvoice.line_items && draftInvoice.line_items.length > 0 && (
              <div className="space-y-2">
                {draftInvoice.line_items.map((line) => (
                  <div key={line.id ?? `${line.description}-${line.amount_cents}`} className="flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium">{line.description}</p>
                      <p className="text-muted-foreground">
                        {line.quantity} × {currency.format(line.unit_price_cents / 100)}
                      </p>
                    </div>
                    <span className="font-semibold">{currency.format(line.amount_cents / 100)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}


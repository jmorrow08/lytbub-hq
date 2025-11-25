'use client';

import { useEffect, useState } from 'react';
import type { BillingPeriod, Invoice } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { addDraftInvoiceLineItem } from '@/lib/api';

type InvoiceBuilderProps = {
  billingPeriods: BillingPeriod[];
  onGenerate: (params: {
    billingPeriodId: string;
    includeProcessingFee: boolean;
    memo?: string;
    manualLines?: Array<{ description: string; quantity?: number; unitPriceCents: number }>;
    collectionMethod?: 'charge_automatically' | 'send_invoice';
    dueDate?: string;
  }) => Promise<void>;
  generating: boolean;
  draftInvoice?: Invoice | null;
};

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function InvoiceBuilder({
  billingPeriods,
  onGenerate,
  generating,
  draftInvoice,
}: InvoiceBuilderProps) {
  const [billingPeriodId, setBillingPeriodId] = useState('');
  const [includeProcessingFee, setIncludeProcessingFee] = useState(true);
  const [memo, setMemo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [manualLines, setManualLines] = useState<
    Array<{ description: string; quantity: string; unitPrice: string }>
  >([]);
  const [liveInvoice, setLiveInvoice] = useState<Invoice | null>(draftInvoice ?? null);
  const [collectionMethod, setCollectionMethod] = useState<'charge_automatically' | 'send_invoice'>(
    'charge_automatically',
  );
  const [dueDate, setDueDate] = useState('');

  // Keep a live copy in sync with latest draft provided by parent
  // (e.g., after creating a new draft via onGenerate)
  useEffect(() => {
    if (draftInvoice && (!liveInvoice || liveInvoice.id !== draftInvoice.id)) {
      setLiveInvoice(draftInvoice);
    }
  }, [draftInvoice, liveInvoice]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!billingPeriodId) {
      setError('Select a billing period.');
      return;
    }
    try {
      await onGenerate({
        billingPeriodId,
        includeProcessingFee,
        memo: memo.trim() || undefined,
        collectionMethod,
        dueDate: collectionMethod === 'send_invoice' && dueDate ? dueDate : undefined,
        // normalize manual lines
        manualLines:
          manualLines.length > 0
            ? manualLines
                .filter((l) => l.description && l.unitPrice)
                .map((l) => ({
                  description: l.description,
                  quantity: Number(l.quantity || 1),
                  unitPriceCents: Math.round(Number(l.unitPrice) * 100),
                }))
            : undefined,
      });
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

          <div className="space-y-2">
            <p className="text-sm font-medium">How to collect payment</p>
            <div className="flex items-center gap-4">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="collection"
                  value="charge_automatically"
                  checked={collectionMethod === 'charge_automatically'}
                  onChange={() => setCollectionMethod('charge_automatically')}
                />
                Auto-charge (subscription / saved payment method)
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="collection"
                  value="send_invoice"
                  checked={collectionMethod === 'send_invoice'}
                  onChange={() => setCollectionMethod('send_invoice')}
                />
                Send invoice (customer pays by due date)
              </label>
            </div>
            {collectionMethod === 'send_invoice' && (
              <div className="grid gap-2 md:grid-cols-2">
                <div>
                  <label htmlFor="due-date" className="block text-sm font-medium mb-1">
                    Due date
                  </label>
                  <Input
                    id="due-date"
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    required
                  />
                </div>
                <p className="text-xs text-muted-foreground md:self-end">
                  Customer will see the due date on Stripe’s hosted page.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Manual line items (optional)</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setManualLines((prev) => [
                    ...prev,
                    { description: '', quantity: '1', unitPrice: '' },
                  ])
                }
              >
                Add line
              </Button>
            </div>
            {manualLines.length > 0 && (
              <div className="space-y-2">
                {manualLines.map((line, idx) => (
                  <div key={idx} className="grid gap-2 md:grid-cols-12">
                    <Input
                      className="md:col-span-6"
                      placeholder="Description"
                      value={line.description}
                      onChange={(e) =>
                        setManualLines((prev) => {
                          const next = [...prev];
                          next[idx] = { ...next[idx], description: e.target.value };
                          return next;
                        })
                      }
                    />
                    <Input
                      className="md:col-span-2"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Qty"
                      value={line.quantity}
                      onChange={(e) =>
                        setManualLines((prev) => {
                          const next = [...prev];
                          next[idx] = { ...next[idx], quantity: e.target.value };
                          return next;
                        })
                      }
                    />
                    <Input
                      className="md:col-span-3"
                      type="number"
                      step="0.01"
                      placeholder="Unit price (USD)"
                      value={line.unitPrice}
                      onChange={(e) =>
                        setManualLines((prev) => {
                          const next = [...prev];
                          next[idx] = { ...next[idx], unitPrice: e.target.value };
                          return next;
                        })
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      className="md:col-span-1"
                      onClick={() => setManualLines((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Tip: Use negative unit price for credits/discounts.
            </p>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <Button type="submit" disabled={generating}>
            {generating ? 'Preparing invoice…' : 'Generate Draft Invoice'}
          </Button>
        </form>

        {(liveInvoice || draftInvoice) && (
          <div className="rounded-lg border border-border/60 p-4 space-y-3 bg-muted/40">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Draft Invoice</p>
                <p className="text-lg font-semibold">
                  {(liveInvoice || draftInvoice)!.invoice_number}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-xl font-bold">
                  {currency.format(((liveInvoice || draftInvoice)!.total_cents || 0) / 100)}
                </p>
              </div>
            </div>
            {(liveInvoice || draftInvoice)!.line_items &&
              (liveInvoice || draftInvoice)!.line_items!.length > 0 && (
                <div className="space-y-2">
                  {(liveInvoice || draftInvoice)!.line_items!.map((line) => (
                    <div
                      key={line.id ?? `${line.description}-${line.amount_cents}`}
                      className="flex items-center justify-between text-sm"
                    >
                      <div>
                        <p className="font-medium">{line.description}</p>
                        <p className="text-muted-foreground">
                          {line.quantity} × {currency.format(line.unit_price_cents / 100)}
                        </p>
                      </div>
                      <span className="font-semibold">
                        {currency.format(line.amount_cents / 100)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            <div className="pt-2 border-t border-border/40">
              <p className="text-sm font-medium mb-2">Add line item to this draft</p>
              <form
                className="grid gap-2 md:grid-cols-12"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget as HTMLFormElement;
                  const formData = new FormData(form);
                  const description = String(formData.get('desc') || '');
                  const quantity = Number(formData.get('qty') || 1);
                  const unitPrice = Number(formData.get('price') || 0);
                  if (!description || !Number.isFinite(unitPrice)) return;
                  try {
                    const updated = await addDraftInvoiceLineItem(
                      (liveInvoice || draftInvoice)!.id,
                      {
                        description,
                        quantity,
                        unitPriceCents: Math.round(unitPrice * 100),
                      },
                    );
                    setLiveInvoice(updated);
                    // Let parent reload invoices; minimal UX: clear fields
                    form.reset();
                  } catch {
                    // no-op; parent will show toast on error if needed
                  }
                }}
              >
                <Input className="md:col-span-6" name="desc" placeholder="Description" required />
                <Input
                  className="md:col-span-2"
                  name="qty"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Qty"
                  defaultValue="1"
                />
                <Input
                  className="md:col-span-3"
                  name="price"
                  type="number"
                  step="0.01"
                  placeholder="Unit price (USD)"
                  required
                />
                <Button className="md:col-span-1" type="submit" variant="outline" size="sm">
                  Add
                </Button>
              </form>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

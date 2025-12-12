'use client';

import { useMemo, useRef, useState } from 'react';
import type { BillingPeriod, Invoice, PendingInvoiceItem, Project } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { addDraftInvoiceLineItem } from '@/lib/api';
import { cn } from '@/lib/utils';

type InvoiceBuilderProps = {
  billingPeriods: BillingPeriod[];
  projects: Project[];
  pendingItems: PendingInvoiceItem[];
  onRefreshPendingItems: () => Promise<void>;
  onGenerate: (params: {
    billingPeriodId: string;
    includeProcessingFee: boolean;
    includeRetainer?: boolean;
    memo?: string;
    manualLines?: Array<{ description: string; quantity?: number; unitPriceCents: number }>;
    collectionMethod?: 'charge_automatically' | 'send_invoice';
    dueDate?: string;
    pendingItemIds?: string[];
  }) => Promise<void>;
  generating: boolean;
  draftInvoice?: Invoice | null;
};

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

const getPendingBillingPeriodId = (item: PendingInvoiceItem): string | null => {
  const metadata = (item.metadata ?? {}) as Record<string, unknown>;
  const raw =
    (metadata.billing_period_id as string | undefined) ??
    (metadata.billingPeriodId as string | undefined);
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
};

export function InvoiceBuilder({
  billingPeriods,
  projects,
  pendingItems,
  onRefreshPendingItems,
  onGenerate,
  generating,
  draftInvoice,
}: InvoiceBuilderProps) {
  const [billingPeriodId, setBillingPeriodId] = useState('');
  const [includeProcessingFee, setIncludeProcessingFee] = useState(true);
  const [includeRetainer, setIncludeRetainer] = useState(false);
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
  const [selectedPendingItemIds, setSelectedPendingItemIds] = useState<string[]>([]);
  const lastProjectIdRef = useRef<string | null>(null);

  const selectedPeriod = useMemo(
    () => billingPeriods.find((period) => period.id === billingPeriodId) ?? null,
    [billingPeriods, billingPeriodId],
  );

  const projectId = selectedPeriod?.project_id ?? null;

  const project = useMemo(() => {
    if (!projectId) return null;
    return projects.find((candidate) => candidate.id === projectId) ?? null;
  }, [projects, projectId]);

  const activeInvoice = useMemo(() => {
    if (liveInvoice && draftInvoice && liveInvoice.id === draftInvoice.id) {
      return liveInvoice;
    }
    if (draftInvoice) {
      return draftInvoice;
    }
    return liveInvoice;
  }, [draftInvoice, liveInvoice]);

  const handleBillingPeriodChange = (nextPeriodId: string) => {
    setBillingPeriodId(nextPeriodId);
    if (!nextPeriodId) {
      lastProjectIdRef.current = null;
      setSelectedPendingItemIds([]);
      setIncludeRetainer(false);
      return;
    }

    const nextPeriod = billingPeriods.find((period) => period.id === nextPeriodId) ?? null;
    const nextProjectId = nextPeriod?.project_id ?? null;

    if (!nextProjectId) {
      lastProjectIdRef.current = null;
      setSelectedPendingItemIds([]);
      setIncludeRetainer(false);
      return;
    }

    setSelectedPendingItemIds((prev) => {
      const permittedIds = new Set(
        pendingItems
          .filter((item) => item.project_id === nextProjectId)
          .map((item) => item.id),
      );
      const periodIds = new Set(
        pendingItems
          .filter((item) => item.project_id === nextProjectId)
          .filter((item) => getPendingBillingPeriodId(item) === nextPeriodId)
          .map((item) => item.id),
      );
      const retained = prev.filter((id) => permittedIds.has(id));
      const merged = new Set([...retained, ...periodIds]);
      return Array.from(merged);
    });

    if (lastProjectIdRef.current !== nextProjectId) {
      const nextProject = projects.find((candidate) => candidate.id === nextProjectId) ?? null;
      const shouldIncludeRetainer = Boolean(
        nextProject?.base_retainer_cents && nextProject.base_retainer_cents > 0,
      );
      setIncludeRetainer((prev) => (prev === shouldIncludeRetainer ? prev : shouldIncludeRetainer));
      lastProjectIdRef.current = nextProjectId;
    }
  };

  const projectPendingItems = useMemo(() => {
    if (!projectId) return [];
    return pendingItems
      .filter((item) => item.project_id === projectId)
      .filter((item) => {
        if (!billingPeriodId) return true;
        const itemPeriod = getPendingBillingPeriodId(item);
        // Only hide items explicitly tied to a different billing period.
        return itemPeriod === null || itemPeriod === billingPeriodId;
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [pendingItems, projectId, billingPeriodId]);

  const outOfPeriodPendingCount = useMemo(() => {
    if (!projectId || !billingPeriodId) return 0;
    return pendingItems.filter((item) => {
      if (item.project_id !== projectId) return false;
      const itemPeriod = getPendingBillingPeriodId(item);
      return itemPeriod !== null && itemPeriod !== billingPeriodId;
    }).length;
  }, [billingPeriodId, pendingItems, projectId]);

  const selectedPendingItems = useMemo(
    () => pendingItems.filter((item) => selectedPendingItemIds.includes(item.id)),
    [pendingItems, selectedPendingItemIds],
  );

  const pendingTotalCents = selectedPendingItems.reduce((sum, item) => {
    const quantity = Number(item.quantity ?? 1) || 1;
    const unitPrice = item.unit_price_cents ?? 0;
    const amount = item.amount_cents ?? Math.round(quantity * unitPrice);
    return sum + amount;
  }, 0);

  const manualLinesTotalCents = manualLines.reduce((sum, line) => {
    const quantity = Number.parseFloat(line.quantity || '1');
    const unit = Number.parseFloat(line.unitPrice || '0');
    if (!Number.isFinite(quantity) || !Number.isFinite(unit)) return sum;
    return sum + Math.round(quantity * unit * 100);
  }, 0);

  const retainerCents =
    includeRetainer && project?.base_retainer_cents ? project.base_retainer_cents : 0;

  const totalCents = pendingTotalCents + retainerCents + manualLinesTotalCents;
  const selectedPendingCount = selectedPendingItems.length;
  const hasManualLines = manualLines.some(
    (line) => line.description.trim().length > 0 && line.unitPrice.trim().length > 0,
  );
  const canSubmit = totalCents > 0 && (collectionMethod !== 'send_invoice' || Boolean(dueDate));

  const togglePendingItem = (itemId: string) => {
    setSelectedPendingItemIds((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId],
    );
  };

  const toggleSelectAll = () => {
    if (!projectId) {
      setSelectedPendingItemIds([]);
      return;
    }
    const ids = projectPendingItems.map((item) => item.id);
    const allSelected = ids.length > 0 && ids.every((id) => selectedPendingItemIds.includes(id));
    if (allSelected) {
      setSelectedPendingItemIds((prev) => prev.filter((id) => !ids.includes(id)));
    } else {
      setSelectedPendingItemIds(ids);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!billingPeriodId) {
      setError('Select a billing period.');
      return;
    }
    if (!projectId) {
      setError('Selected billing period is missing a project.');
      return;
    }

    const normalizedManualLines =
      manualLines.length > 0
        ? manualLines
            .filter((line) => line.description && line.unitPrice)
            .map((line) => {
              const parsedQty = Number.parseFloat(line.quantity || '1');
              const quantity = Number.isFinite(parsedQty) && parsedQty > 0 ? parsedQty : 1;
              return {
                description: line.description.trim(),
                quantity,
                unitPriceCents: Math.round((Number.parseFloat(line.unitPrice) || 0) * 100),
              };
            })
            .filter((line) => line.description && line.unitPriceCents !== 0)
        : [];

    const hasManualLines = normalizedManualLines.length > 0;
    const hasPendingSelection = selectedPendingItemIds.length > 0;

    if (!hasPendingSelection && !hasManualLines && retainerCents <= 0) {
      setError('Select pending items, add a manual line, or include the retainer.');
      return;
    }

    if (collectionMethod === 'send_invoice' && !dueDate) {
      setError('Set a due date for invoices that will be sent to the client.');
      return;
    }

    try {
      await onGenerate({
        billingPeriodId,
        includeProcessingFee,
        includeRetainer,
        memo: memo.trim() || undefined,
        collectionMethod,
        dueDate: collectionMethod === 'send_invoice' && dueDate ? dueDate : undefined,
        manualLines: hasManualLines ? normalizedManualLines : undefined,
        pendingItemIds: hasPendingSelection ? selectedPendingItemIds : undefined,
      });
      await onRefreshPendingItems();
      setSelectedPendingItemIds([]);
      setManualLines([]);
      setMemo('');
      setDueDate('');
      setIncludeProcessingFee(true);
      setLiveInvoice(null);
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
              onChange={(event) => handleBillingPeriodChange(event.target.value)}
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

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Pending items for this project</p>
                {outOfPeriodPendingCount > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {outOfPeriodPendingCount} item{outOfPeriodPendingCount === 1 ? '' : 's'} tagged to
                    other billing periods are hidden.
                  </p>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={toggleSelectAll}
                disabled={projectPendingItems.length === 0}
              >
                {projectPendingItems.length > 0 &&
                projectPendingItems.every((item) => selectedPendingItemIds.includes(item.id))
                  ? 'Clear selection'
                  : 'Select all'}
              </Button>
            </div>
            <div className="max-h-56 overflow-y-auto rounded-md border border-dashed px-3 py-2 text-sm">
              {!billingPeriodId ? (
                <p className="text-muted-foreground">
                  Select a billing period to view pending items.
                </p>
              ) : projectPendingItems.length === 0 ? (
                <p className="text-muted-foreground">No pending items queued for this project.</p>
              ) : (
                projectPendingItems.map((item) => {
                  const quantity = Number(item.quantity ?? 1) || 1;
                  const unitPrice = item.unit_price_cents ?? 0;
                  const amount = (item.amount_cents ?? Math.round(quantity * unitPrice)) / 100;
                  const isSelected = selectedPendingItemIds.includes(item.id);
                  return (
                    <label
                      key={item.id}
                      className={cn(
                        'flex items-start justify-between gap-3 rounded-md px-2 py-2 transition-colors',
                        isSelected ? 'bg-accent/30' : 'hover:bg-muted/50',
                      )}
                    >
                      <span className="flex-1 space-y-1">
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                            checked={isSelected}
                            onChange={() => togglePendingItem(item.id)}
                          />
                          <span className="font-medium">{item.description}</span>
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          Created {new Date(item.created_at).toLocaleDateString()}
                          {getPendingBillingPeriodId(item) && (
                            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide">
                              {getPendingBillingPeriodId(item)}
                            </span>
                          )}
                        </span>
                      </span>
                      <span className="whitespace-nowrap font-semibold">
                        {currency.format(amount)}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Quick add from the queue if you performed work outside the billing period.
            </p>
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

          <div className="flex items-start gap-2">
            <input
              id="include-retainer"
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-input text-primary focus:ring-primary"
              checked={includeRetainer}
              onChange={(event) => setIncludeRetainer(event.target.checked)}
            />
            <label htmlFor="include-retainer" className="text-sm text-muted-foreground">
              Include base retainer line item in this invoice. Leave off to bill extra work only.
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
              <div className="flex items-center gap-2">
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
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setManualLines((prev) => [
                      ...prev,
                      { description: 'Account credit', quantity: '1', unitPrice: '-50.00' },
                    ])
                  }
                >
                  Add credit/discount
                </Button>
              </div>
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
                      placeholder="Unit price (USD) — use negatives for credits"
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
              Tip: Use negative unit price for credits/discounts. These lines appear on the client
              invoice and reduce the total.
            </p>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-border/60 bg-muted/40 px-4 py-3 text-sm">
            <div className="space-y-1">
              <p>
                Pending selection:{' '}
                <span className="font-semibold">{currency.format(pendingTotalCents / 100)}</span>
                {selectedPendingCount > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {' '}
                    ({selectedPendingCount} item{selectedPendingCount === 1 ? '' : 's'})
                  </span>
                )}
              </p>
              {includeRetainer && retainerCents > 0 && (
                <p>
                  Retainer{' '}
                  <span className="font-semibold">{currency.format(retainerCents / 100)}</span>
                </p>
              )}
              {hasManualLines && (
                <p>
                  Manual lines{' '}
                  <span className="font-semibold">{currency.format(manualLinesTotalCents / 100)}</span>
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Invoice total</p>
              <p className="text-lg font-semibold">{currency.format(totalCents / 100)}</p>
            </div>
          </div>

          <Button type="submit" disabled={generating || !canSubmit}>
            {generating ? 'Preparing invoice…' : 'Generate Draft Invoice'}
          </Button>
        </form>

        {activeInvoice && (
          <div className="rounded-lg border border-border/60 p-4 space-y-3 bg-muted/40">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Draft Invoice</p>
                <p className="text-lg font-semibold">{activeInvoice.invoice_number}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-xl font-bold">
                  {currency.format((activeInvoice.total_cents || 0) / 100)}
                </p>
              </div>
            </div>
            {activeInvoice.line_items && activeInvoice.line_items.length > 0 && (
              <div className="space-y-2">
                {activeInvoice.line_items.map((line) => (
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
                  const currentInvoiceId = activeInvoice.id;
                  const form = e.currentTarget as HTMLFormElement;
                  const formData = new FormData(form);
                  const description = String(formData.get('desc') || '');
                  const quantity = Number(formData.get('qty') || 1);
                  const unitPrice = Number(formData.get('price') || 0);
                  if (!description || !Number.isFinite(unitPrice)) return;
                  const unitPriceCents = Math.round(unitPrice * 100);
                  if (unitPriceCents === 0) {
                    const confirmFree = window.confirm(
                      'This line item has a zero price. Add it anyway?',
                    );
                    if (!confirmFree) {
                      return;
                    }
                  }
                  try {
                    const updated = await addDraftInvoiceLineItem(currentInvoiceId, {
                      description,
                      quantity,
                      unitPriceCents,
                    });
                    setLiveInvoice((prev) => {
                      if (updated.id !== currentInvoiceId) {
                        return prev;
                      }
                      return updated;
                    });
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

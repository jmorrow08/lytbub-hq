'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Loader2, ArrowLeft, Copy, Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UsageBreakdown } from '@/components/client-portal/UsageBreakdown';
import { portalFetch } from '@/lib/client-portal/fetch';
import { formatDate } from '@/lib/date-utils';

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

type InvoiceDetail = {
  id: string;
  invoiceNumber: string | null;
  status: string;
  createdAt: string;
  dueDate: string | null;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  netAmountCents: number;
  amountDueCents: number;
  hostedUrl: string | null;
  pdfUrl: string | null;
  publicShareId: string | null;
  publicShareExpiresAt: string | null;
  portalPayload: {
    usageDetails?: Array<{
      toolName?: string;
      billedAmount?: number;
      rawCost?: number;
      markupPercent?: number;
      description?: string;
    }>;
    shadowItems?: Array<{
      label: string;
      description?: string;
      impliedValue?: number;
      isComplimentary?: boolean;
      hours?: number;
      marketRatePerHour?: number;
    }>;
    shadowSummary?: {
      totalImpliedValue?: number;
      complimentaryValue?: number;
      note?: string;
      retainerCurrentCents?: number;
      retainerNormalCents?: number;
      retainerIncludes?: string[];
    };
    aiNotes?: string;
    roadmapUpdates?: string[];
    periodLabel?: string;
  };
  metadata: Record<string, unknown>;
  projectName: string | null;
  lineItems: Array<{
    id: string;
    description: string;
    quantity: number;
    unitPriceCents: number;
    totalCents: number;
    category: string | null;
    metadata: Record<string, unknown> | null;
  }>;
  payments: Array<{
    id: string;
    amountCents: number;
    status: string;
    processedAt: string | null;
    method: string | null;
    receiptUrl: string | null;
  }>;
};

const statusLabel: Record<string, string> = {
  draft: 'Draft',
  open: 'Open',
  paid: 'Paid',
  void: 'Void',
  pending: 'Pending',
  overdue: 'Overdue',
};

function centsToUsd(cents: number) {
  return currency.format(cents / 100);
}

export default function ClientStatementDetailPage() {
  const params = useParams<{ invoiceId: string }>();
  const router = useRouter();
  const invoiceId = params.invoiceId;
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!invoiceId) {
      setError('Invoice not found.');
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const payload = await portalFetch(`/api/client-portal/invoices/${invoiceId}`);
        setInvoice(payload.invoice as InvoiceDetail);
      } catch (err) {
        console.error('Failed to load invoice detail', err);
        setError(err instanceof Error ? err.message : 'Unable to load invoice detail.');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [invoiceId]);

  const shareUrl = useMemo(() => {
    if (!invoice?.publicShareId) return null;
    if (typeof window === 'undefined') return null;
    const origin = window.location.origin.replace(/\/$/, '');
    const params = new URLSearchParams();
    params.set('share', invoice.publicShareId);
    params.set('redirect', `/client/statements/${invoice.id}`);
    return `${origin}/client/signup?${params.toString()}`;
  }, [invoice?.publicShareId, invoice?.id]);

  const handleCopyShareLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.error('Failed to copy share link', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading statement…
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="space-y-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.back()}
          className="inline-flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error ?? 'Unable to load statement.'}
        </div>
      </div>
    );
  }

  const invoiceStatus = statusLabel[invoice.status] ?? invoice.status;
  const amountDue = centsToUsd(invoice.amountDueCents);
  const total = centsToUsd(invoice.totalCents);
  const subtotal = centsToUsd(invoice.subtotalCents);
  const tax = centsToUsd(invoice.taxCents);
  const dueDateLabel = invoice.dueDate ? formatDate(invoice.dueDate) ?? 'On receipt' : 'On receipt';
  const hasPayments = invoice.payments.length > 0;
  const usageItems =
    invoice.portalPayload.usageDetails?.map((detail) => ({
      label: detail.toolName ?? 'Usage',
      description: detail.description,
      billedAmount: detail.billedAmount ?? null,
      rawCost: detail.rawCost ?? null,
      markupPercent: detail.markupPercent ?? null,
    })) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.back()}
          className="inline-flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" /> Back to statements
        </Button>
        <div className="flex flex-wrap gap-2">
          {invoice.pdfUrl && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/api/client-portal/statements/${invoice.id}/download?type=pdf`}>
                Download PDF
              </Link>
            </Button>
          )}
          <Button variant="outline" size="sm" asChild>
            <Link href={`/api/client-portal/statements/${invoice.id}/download?type=csv`}>
              Download CSV
            </Link>
          </Button>
          {shareUrl && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyShareLink}
              className="inline-flex items-center gap-2"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied' : 'Copy share link'}
            </Button>
          )}
        </div>
      </div>

      <Card className="bg-slate-900/60 border-slate-800">
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Lytbub AI Systems</p>
              <h1 className="text-3xl font-semibold tracking-tight mt-1">AI Service Statement</h1>
              <p className="text-sm text-slate-400 mt-1">
                {invoice.projectName ? `${invoice.projectName} • ` : ''}
                {invoice.portalPayload.periodLabel ?? 'Billing'}
              </p>
              <div className="mt-2 flex items-center gap-2 text-sm">
                <span className="inline-flex items-center rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-200">
                  {invoiceStatus}
                </span>
                <span className="text-xs text-slate-400">
                  Invoice #{invoice.invoiceNumber ?? invoice.id.slice(0, 8)}
                </span>
              </div>
            </div>
            <div className="flex flex-col items-start md:items-end gap-3">
              <div className="text-right">
                <div className="text-xs uppercase tracking-wide text-slate-400">Amount Due</div>
                <div className="text-2xl font-semibold text-slate-50">{amountDue}</div>
                <div className="text-xs text-slate-500">Due {dueDateLabel}</div>
              </div>
              {invoice.hostedUrl && invoice.status === 'open' && (
                <Button asChild>
                  <Link href={invoice.hostedUrl} target="_blank" rel="noreferrer">
                    Pay securely
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-[2fr,1fr]">
        <Card className="bg-slate-900/60 border-slate-800">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-slate-200">
              Invoice breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4">Description</th>
                    <th className="py-2 pr-4 text-right">Qty</th>
                    <th className="py-2 pr-4 text-right">Unit</th>
                    <th className="py-2 pr-4 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {invoice.lineItems.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-950/50">
                      <td className="py-3 pr-4">
                        <div className="font-medium text-slate-100">{item.description}</div>
                        {item.category && (
                          <div className="text-xs text-muted-foreground">{item.category}</div>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-right text-slate-200">{item.quantity}</td>
                      <td className="py-3 pr-4 text-right text-slate-200">
                        {centsToUsd(item.unitPriceCents)}
                      </td>
                      <td className="py-3 pr-4 text-right text-slate-200">
                        {centsToUsd(item.totalCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-slate-800/80 pt-4 text-sm text-slate-200">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{subtotal}</span>
              </div>
              <div className="flex justify-between">
                <span>Tax</span>
                <span>{tax}</span>
              </div>
              <div className="flex justify-between font-semibold text-slate-50">
                <span>Total</span>
                <span>{total}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/60 border-slate-800">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-slate-200">
              Tooling &amp; infrastructure usage
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <UsageBreakdown
              items={usageItems}
              emptyMessage="No usage-based fees recorded for this period."
            />
          </CardContent>
        </Card>
      </div>

      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-slate-200">Payment history</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {!hasPayments ? (
            <p className="text-xs text-muted-foreground">
              No payments have been recorded for this statement yet.
            </p>
          ) : (
            <div className="space-y-3">
              {invoice.payments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex flex-col gap-2 rounded-md border border-slate-800 bg-slate-950/60 px-3 py-3 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <div className="text-sm font-semibold text-slate-100">
                      {centsToUsd(payment.amountCents)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {payment.processedAt
                        ? new Date(payment.processedAt).toLocaleString()
                        : 'Pending capture'}
                    </div>
                    {payment.method && (
                      <div className="text-[11px] text-slate-500">{payment.method}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-200">
                      {payment.status}
                    </span>
                    {payment.receiptUrl && (
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={payment.receiptUrl} target="_blank" rel="noreferrer">
                          Receipt
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-slate-200">
            Value breakdown & fee details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-xs text-muted-foreground">
            Not a charge — this explains what each fee covers and the real-world value of work
            delivered.
          </p>
          {invoice.portalPayload.shadowItems?.length ? (
            <div className="grid gap-3 md:grid-cols-3">
              {invoice.portalPayload.shadowItems.map((item, index) => (
                <div
                  key={`${item.label}-${index}`}
                  className="rounded-md border border-slate-800 bg-slate-950/60 p-3"
                >
                  <div className="text-xs font-semibold text-slate-200">{item.label}</div>
                  {item.description && (
                    <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">
                      {item.description}
                    </p>
                  )}
                  {item.impliedValue !== undefined && (
                    <div className="mt-2 text-xs text-slate-200">
                      Implied value: {currency.format(item.impliedValue)}
                    </div>
                  )}
                  {item.hours !== undefined && item.marketRatePerHour !== undefined && (
                    <div className="mt-1 text-[11px] text-slate-500">
                      {item.hours} hrs × ${item.marketRatePerHour}/hr
                    </div>
                  )}
                  {item.isComplimentary && (
                    <div className="mt-1 text-[11px] text-emerald-400">
                      Included at no extra cost.
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No value items provided for this period.
            </p>
          )}
          {invoice.portalPayload.shadowSummary && (
            <div className="rounded-md border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-300 space-y-1">
              <div>
                Implied:{' '}
                {currency.format(invoice.portalPayload.shadowSummary.totalImpliedValue ?? 0)}
              </div>
              <div>
                Complimentary:{' '}
                {currency.format(invoice.portalPayload.shadowSummary.complimentaryValue ?? 0)}
              </div>
              {typeof invoice.portalPayload.shadowSummary.retainerCurrentCents === 'number' && (
                <div>
                  Retainer:{' '}
                  {currency.format(
                    (invoice.portalPayload.shadowSummary.retainerCurrentCents ?? 0) / 100,
                  )}{' '}
                  {typeof invoice.portalPayload.shadowSummary.retainerNormalCents === 'number' && (
                    <span className="text-slate-500">
                      (normal{' '}
                      {currency.format(
                        (invoice.portalPayload.shadowSummary.retainerNormalCents ?? 0) / 100,
                      )}
                      )
                    </span>
                  )}
                </div>
              )}
              {Array.isArray(invoice.portalPayload.shadowSummary.retainerIncludes) &&
                invoice.portalPayload.shadowSummary.retainerIncludes.length > 0 && (
                  <div className="text-[11px] text-muted-foreground">
                    Includes: {invoice.portalPayload.shadowSummary.retainerIncludes.join(', ')}
                  </div>
                )}
              {invoice.portalPayload.shadowSummary.note && (
                <div className="mt-1 text-[11px] text-muted-foreground">
                  Note: {invoice.portalPayload.shadowSummary.note}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {(invoice.portalPayload.aiNotes || invoice.portalPayload.roadmapUpdates?.length) && (
        <Card className="bg-slate-900/60 border-slate-800">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-slate-200">Account notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {invoice.portalPayload.aiNotes && (
              <div>
                <div className="text-xs uppercase text-muted-foreground">Highlights</div>
                <p className="mt-1 text-slate-200 leading-relaxed">
                  {invoice.portalPayload.aiNotes}
                </p>
              </div>
            )}
            {invoice.portalPayload.roadmapUpdates?.length ? (
              <div>
                <div className="text-xs uppercase text-muted-foreground">Upcoming</div>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-200">
                  {invoice.portalPayload.roadmapUpdates.map((item, index) => (
                    <li key={`${item}-${index}`}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

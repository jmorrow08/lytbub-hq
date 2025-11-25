'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Invoice } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { deleteDraftInvoice } from '@/lib/api';
import { Copy } from 'lucide-react';

type InvoiceListProps = {
  invoices: Invoice[];
  onFinalize: (invoiceId: string) => Promise<void>;
  onMarkOffline: (invoiceId: string) => Promise<void>;
  finalizingId?: string | null;
  markingId?: string | null;
  clientLookup?: Record<string, string>;
};

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function formatYmdAsLocaleDate(ymd: string): string {
  // Avoid timezone shifts by parsing YYYY-MM-DD into a local Date
  const parts = ymd.split('-').map((p) => Number(p));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return ymd;
  const [year, month, day] = parts;
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString();
}

function formatMethodDetail(
  method?: string | null,
  brand?: string | null,
  last4?: string | null,
): string | null {
  if (!method && !brand && !last4) return null;
  const label = brand || method;
  if (!label) return null;
  return last4 ? `${label} ••••${last4}` : label;
}

export function InvoiceList({
  invoices,
  onFinalize,
  onMarkOffline,
  finalizingId,
  markingId,
  clientLookup,
}: InvoiceListProps) {
  const sortedInvoices = useMemo(
    () => [...invoices].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
    [invoices],
  );
  const [copiedInvoiceId, setCopiedInvoiceId] = useState<string | null>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const handleFinalize = async (invoiceId: string) => {
    await onFinalize(invoiceId);
  };

  const handleMarkOffline = async (invoiceId: string) => {
    await onMarkOffline(invoiceId);
  };

  const handleCopyLink = async (invoice: Invoice) => {
    if (!invoice.stripe_hosted_url) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(invoice.stripe_hosted_url);
      } else if (typeof window !== 'undefined') {
        window.prompt('Copy invoice link:', invoice.stripe_hosted_url);
      }
      setCopiedInvoiceId(invoice.id);
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = setTimeout(() => setCopiedInvoiceId(null), 2000);
    } catch (error) {
      console.error('[InvoiceList] clipboard error', error);
      if (typeof window !== 'undefined') {
        window.prompt('Copy invoice link:', invoice.stripe_hosted_url);
      }
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invoices</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {sortedInvoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No invoices yet. Generate a draft to begin.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2 text-left">Invoice</th>
                  <th className="py-2 text-left">Client</th>
                  <th className="py-2 text-left">Due</th>
                  <th className="py-2 text-left">Total</th>
                  <th className="py-2 text-left">Status</th>
                  <th className="py-2 text-left">Payment Method</th>
                  <th className="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedInvoices.map((invoice) => {
                  const paidVia = formatMethodDetail(
                    invoice.payment_method_used,
                    invoice.payment_brand,
                    invoice.payment_last4,
                  );

                  return (
                    <tr key={invoice.id} className="border-b border-border/40">
                      <td className="py-3">
                        <div className="font-semibold">{invoice.invoice_number}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(invoice.created_at).toLocaleString()}
                        </div>
                      </td>
                      <td className="py-3">
                        {clientLookup?.[invoice.project_id] ?? invoice.project_id}
                      </td>
                      <td className="py-3">
                        {invoice.collection_method === 'send_invoice' && invoice.due_date
                          ? formatYmdAsLocaleDate(invoice.due_date)
                          : '—'}
                      </td>
                      <td className="py-3 font-semibold">
                        {currency.format(invoice.total_cents / 100)}
                      </td>
                      <td className="py-3 capitalize">
                        <StatusBadge status={invoice.status} />
                      </td>
                      <td className="py-3 capitalize">
                        {invoice.payment_method_type}
                        {invoice.collection_method === 'send_invoice' ? ' (invoice)' : ' (auto)'}
                        {invoice.status === 'paid' && paidVia && (
                          <span className="block text-xs font-normal normal-case text-muted-foreground">
                            Paid via {paidVia}
                          </span>
                        )}
                      </td>
                      <td className="py-3">
                        <div className="flex items-center justify-end gap-2">
                          {invoice.stripe_hosted_url && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex items-center gap-1"
                                onClick={() => handleCopyLink(invoice)}
                              >
                                <Copy className="h-4 w-4" />
                                {copiedInvoiceId === invoice.id ? 'Copied' : 'Copy link'}
                              </Button>
                              <Button asChild size="sm" variant="outline">
                                <a
                                  href={invoice.stripe_hosted_url}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  View
                                </a>
                              </Button>
                            </>
                          )}
                          {invoice.status !== 'paid' && (
                            <>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handleFinalize(invoice.id)}
                                disabled={finalizingId === invoice.id}
                              >
                                {finalizingId === invoice.id ? 'Finalizing…' : 'Finalize'}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleMarkOffline(invoice.id)}
                                disabled={markingId === invoice.id}
                              >
                                {markingId === invoice.id ? 'Marking…' : 'Mark Paid (Offline)'}
                              </Button>
                              {invoice.status === 'draft' && (
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={async () => {
                                    if (typeof window !== 'undefined') {
                                      const yes = window.confirm(
                                        'Delete this draft invoice? This cannot be undone.',
                                      );
                                      if (!yes) return;
                                    }
                                    try {
                                      await deleteDraftInvoice(invoice.id);
                                    } catch {
                                      // ignoring here; parent may refresh list elsewhere
                                    }
                                  }}
                                >
                                  Delete
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: Invoice['status'] }) {
  const colors: Record<Invoice['status'], string> = {
    draft: 'bg-muted text-muted-foreground',
    open: 'bg-amber-500/10 text-amber-600',
    paid: 'bg-emerald-500/10 text-emerald-600',
    void: 'bg-red-500/10 text-red-600',
  };
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${colors[status]}`}>
      {status}
    </span>
  );
}

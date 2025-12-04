'use client';

export const dynamic = 'force-dynamic';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatementList, type StatementRecord } from '@/components/client-portal/StatementList';
import { UsageBreakdown } from '@/components/client-portal/UsageBreakdown';
import { useClientPortalContext } from '@/components/client-portal/ClientPortalShell';
import { portalFetch } from '@/lib/client-portal/fetch';
import { formatDate } from '@/lib/date-utils';

type UsageSummary = {
  summary: {
    totalCostCents: number;
    totalQuantity: number;
    totalEvents: number;
  };
  breakdown: Array<{
    metricType: string;
    totalQuantity: number;
    rawCostCents: number;
    events: number;
  }>;
};

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function ClientDashboardPage() {
  const { activeClientId, memberships } = useClientPortalContext();
  const activeClient = useMemo(
    () => memberships.find((item) => item.id === activeClientId) ?? null,
    [memberships, activeClientId],
  );

  const [invoices, setInvoices] = useState<StatementRecord[]>([]);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeClientId) {
      setInvoices([]);
      setUsage(null);
      return;
    }

    setLoading(true);
    setError(null);

    const load = async () => {
      try {
        const invoicePayload = await portalFetch(
          `/api/client-portal/invoices?clientId=${activeClientId}&limit=20`,
        );
        const usagePayload = await portalFetch(
          `/api/client-portal/usage?clientId=${activeClientId}`,
        );

        type InvoiceSummary = {
          id: string;
          invoiceNumber?: string | null;
          status: string;
          createdAt: string;
          dueDate?: string | null;
          totalCents: number;
          amountDueCents: number;
          publicShareId?: string | null;
          hostedUrl?: string | null;
          pdfUrl?: string | null;
        };

        const invoiceData = ((invoicePayload.invoices ?? []) as InvoiceSummary[]).map(
          (invoice) => ({
            id: invoice.id,
            invoiceNumber: invoice.invoiceNumber ?? null,
            status: invoice.status,
            createdAt: invoice.createdAt,
            dueDate: invoice.dueDate ?? null,
            totalCents: Number(invoice.totalCents ?? 0) || 0,
            amountDueCents: Number(invoice.amountDueCents ?? 0) || 0,
            publicShareId: invoice.publicShareId ?? null,
            hostedUrl: invoice.hostedUrl ?? null,
            pdfUrl: invoice.pdfUrl ?? null,
          }),
        );

        setInvoices(invoiceData);
        setUsage(usagePayload as UsageSummary);
      } catch (loadError) {
        console.error('Failed to load dashboard data', loadError);
        setError(loadError instanceof Error ? loadError.message : 'Unable to load dashboard data.');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [activeClientId]);

  const outstandingAmount = useMemo(() => {
    return invoices
      .filter((invoice) => invoice.status === 'open')
      .reduce((sum, invoice) => sum + invoice.amountDueCents, 0);
  }, [invoices]);

  const nextDueInvoice = useMemo(() => {
    const upcoming = invoices
      .filter((invoice) => invoice.status === 'open' && invoice.dueDate)
      .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));
    return upcoming[0] ?? null;
  }, [invoices]);

  const recentInvoice = invoices[0] ?? null;
  const breakdownList = usage?.breakdown ?? [];
  const topUsageItems = breakdownList.slice(0, 5).map((item) => ({
    label: item.metricType,
    description: `${item.events} events`,
    rawCostCents: item.rawCostCents,
  }));

  if (!activeClientId || !activeClient) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-50">{activeClient.name}</h1>
            {activeClient.companyName && (
              <p className="text-sm text-muted-foreground">{activeClient.companyName}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/client/statements">View all statements</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/client/usage">Usage reports</Link>
            </Button>
          </div>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading latest activity…
          </div>
        )}

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="bg-slate-900/60 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-300">
                Outstanding balance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold text-slate-50">
                {formatCurrency(outstandingAmount)}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Across open invoices</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-900/60 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-300">
                Most recent statement
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentInvoice ? (
                <div className="space-y-1">
                  <div className="text-2xl font-semibold text-slate-50">
                    {formatCurrency(recentInvoice.totalCents)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Issued {new Date(recentInvoice.createdAt).toLocaleDateString()}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No invoices yet.</p>
              )}
            </CardContent>
          </Card>
          <Card className="bg-slate-900/60 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-300">Next due date</CardTitle>
            </CardHeader>
            <CardContent>
              {nextDueInvoice ? (
                <div className="space-y-1">
                  <div className="text-2xl font-semibold text-slate-50">
                    {nextDueInvoice.dueDate
                      ? formatDate(nextDueInvoice.dueDate, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        }) ?? 'Due on receipt'
                      : 'Due on receipt'}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(nextDueInvoice.amountDueCents)} due on invoice{' '}
                    {nextDueInvoice.invoiceNumber ?? nextDueInvoice.id.slice(0, 8)}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">All caught up.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="bg-slate-900/60 border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold text-slate-200">
              Recent statements
            </CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/client/statements">See all</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <StatementList
              statements={invoices}
              isLoading={loading}
              emptyMessage="No invoices available yet."
              showFilters={false}
              limit={6}
            />
          </CardContent>
        </Card>

        <Card className="bg-slate-900/60 border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold text-slate-200">
              Last 30 days usage
            </CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/client/usage">Usage details</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {!usage ? (
              <p className="text-sm text-muted-foreground">
                Usage details will appear once data is recorded.
              </p>
            ) : usage.summary.totalEvents === 0 ? (
              <p className="text-sm text-muted-foreground">
                No metered usage recorded in this period.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <div className="text-xs uppercase text-muted-foreground">Total usage cost</div>
                    <div className="text-xl font-semibold text-slate-50">
                      {formatCurrency(usage.summary.totalCostCents)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase text-muted-foreground">Events captured</div>
                    <div className="text-xl font-semibold text-slate-50">
                      {usage.summary.totalEvents}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase text-muted-foreground">Top service</div>
                    <div className="text-sm font-semibold text-slate-200">
                      {topUsageItems[0]?.label ?? 'Usage'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatCurrency(topUsageItems[0]?.rawCostCents ?? 0)} billed
                    </div>
                  </div>
                </div>
                <UsageBreakdown
                  items={topUsageItems}
                  emptyMessage="No usage found for the selected period."
                  highlightFirst
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Suspense>
  );
}

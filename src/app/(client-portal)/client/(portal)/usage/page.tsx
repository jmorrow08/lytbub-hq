'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Loader2, Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UsageBreakdown } from '@/components/client-portal/UsageBreakdown';
import { useClientPortalContext } from '@/components/client-portal/ClientPortalShell';
import { portalFetch } from '@/lib/client-portal/fetch';
import { formatDate, formatDateTime } from '@/lib/date-utils';

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function getDefaultDateRange() {
  const now = new Date();
  const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return {
    start: format(start, 'yyyy-MM-dd'),
    end: format(now, 'yyyy-MM-dd'),
  };
}

type UsageResponse = {
  summary: { totalCostCents: number; totalQuantity: number; totalEvents: number };
  breakdown: Array<{
    metricType: string;
    totalQuantity: number;
    rawCostCents: number;
    events: number;
  }>;
  timeseries: Array<{ date: string; totalCostCents: number; totalQuantity: number }>;
  events: Array<{
    id: string;
    eventDate: string;
    metricType: string;
    quantity: number;
    unitPriceCents: number;
    rawCostCents: number;
    description: string | null;
    projectName: string | null;
    totalTokens: number | null;
  }>;
};

export default function ClientUsagePage() {
  const { activeClientId } = useClientPortalContext();
  const defaultRange = useMemo(getDefaultDateRange, []);
  const [startDate, setStartDate] = useState(defaultRange.start);
  const [endDate, setEndDate] = useState(defaultRange.end);
  const [groupBy, setGroupBy] = useState<'metric' | 'project'>('metric');
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadUsage = useCallback(async () => {
    if (!activeClientId) return;
    setLoading(true);
    setError(null);
    try {
      const search = new URLSearchParams({
        clientId: activeClientId,
        startDate,
        endDate,
        groupBy,
      });
      const data = await portalFetch(`/api/client-portal/usage?${search.toString()}`);
      setUsage(data as UsageResponse);
    } catch (err) {
      console.error('Failed to load usage data', err);
      setError(err instanceof Error ? err.message : 'Unable to load usage data.');
    } finally {
      setLoading(false);
    }
  }, [activeClientId, startDate, endDate, groupBy]);

  useEffect(() => {
    void loadUsage();
  }, [loadUsage]);

  const downloadCsv = async () => {
    if (!usage) return;
    const rows: string[][] = [];
    rows.push([
      'Event Date',
      'Metric',
      'Quantity',
      'Total Tokens',
      'Unit Price (USD)',
      'Raw Cost (USD)',
      'Project',
      'Description',
    ]);
    usage.events.forEach((event) => {
      rows.push([
        event.eventDate,
        event.metricType,
        String(event.quantity),
        event.totalTokens != null ? String(event.totalTokens) : '',
        (event.unitPriceCents / 100).toFixed(4),
        (event.rawCostCents / 100).toFixed(4),
        event.projectName ?? '',
        (event.description ?? '').replace(/\n/g, ' '),
      ]);
    });
    const csv = rows
      .map((row) => row.map((value) => `"${value.replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `usage-${startDate}-to-${endDate}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const breakdown = usage?.breakdown ?? [];
  const timeseries = usage?.timeseries ?? [];
  const breakdownItems = breakdown.map((item) => ({
    label: item.metricType,
    description: `Quantity: ${item.totalQuantity.toLocaleString()}`,
    rawCostCents: item.rawCostCents,
    meta: <span>{item.events} events</span>,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-50">Usage reports</h1>
          <p className="text-sm text-muted-foreground">
            Export metered usage and inspect detailed activity.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground" htmlFor="start-date">
              Start date
            </label>
            <Input
              id="start-date"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground" htmlFor="end-date">
              End date
            </label>
            <Input
              id="end-date"
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Group by</label>
            <div className="flex rounded-md border border-slate-800 bg-slate-950/60 text-xs">
              <button
                type="button"
                className={`px-3 py-2 ${
                  groupBy === 'metric' ? 'bg-primary/20 text-slate-50' : 'text-muted-foreground'
                }`}
                onClick={() => setGroupBy('metric')}
              >
                Service
              </button>
              <button
                type="button"
                className={`px-3 py-2 ${
                  groupBy === 'project' ? 'bg-primary/20 text-slate-50' : 'text-muted-foreground'
                }`}
                onClick={() => setGroupBy('project')}
              >
                Project
              </button>
            </div>
          </div>
          <div className="flex items-end gap-2">
            <Button onClick={loadUsage} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Apply
            </Button>
            <Button
              variant="outline"
              onClick={downloadCsv}
              disabled={!usage || usage.events.length === 0}
              className="inline-flex items-center gap-2"
            >
              <Download className="h-4 w-4" /> Download CSV
            </Button>
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading usage…
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {usage && (
        <>
          <Card className="bg-slate-900/60 border-slate-800">
            <CardHeader>
              <CardTitle className="text-base font-semibold text-slate-200">Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <div className="text-xs uppercase text-muted-foreground">Total cost</div>
                  <div className="text-xl font-semibold text-slate-50">
                    {currency.format(usage.summary.totalCostCents / 100)}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground">Usage quantity</div>
                  <div className="text-xl font-semibold text-slate-50">
                    {usage.summary.totalQuantity.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground">Events captured</div>
                  <div className="text-xl font-semibold text-slate-50">
                    {usage.summary.totalEvents}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/60 border-slate-800">
            <CardHeader>
              <CardTitle className="text-base font-semibold text-slate-200">Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <UsageBreakdown
                items={breakdownItems}
                emptyMessage="No usage found for the selected period."
                highlightFirst
              />
            </CardContent>
          </Card>

          <Card className="bg-slate-900/60 border-slate-800">
            <CardHeader>
              <CardTitle className="text-base font-semibold text-slate-200">Daily totals</CardTitle>
            </CardHeader>
            <CardContent>
              {timeseries.length === 0 ? (
                <p className="text-sm text-muted-foreground">No daily activity to report.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="py-2 pr-4">Date</th>
                        <th className="py-2 pr-4 text-right">Cost</th>
                        <th className="py-2 pr-4 text-right">Quantity</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {timeseries.map((day) => {
                        const formattedDate = formatDate(day.date) ?? day.date;
                        return (
                          <tr key={day.date} className="hover:bg-slate-950/50">
                            <td className="py-3 pr-4 text-slate-100">{formattedDate}</td>
                            <td className="py-3 pr-4 text-right text-slate-200">
                              {currency.format(day.totalCostCents / 100)}
                            </td>
                            <td className="py-3 pr-4 text-right text-slate-200">
                              {day.totalQuantity.toLocaleString()}
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

          <Card className="bg-slate-900/60 border-slate-800">
            <CardHeader>
              <CardTitle className="text-base font-semibold text-slate-200">Events</CardTitle>
            </CardHeader>
            <CardContent>
              {usage.events.length === 0 ? (
                <p className="text-sm text-muted-foreground">No usage events recorded.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="py-2 pr-4">Date</th>
                        <th className="py-2 pr-4">Metric</th>
                        <th className="py-2 pr-4">Project</th>
                        <th className="py-2 pr-4 text-right">Usage</th>
                        <th className="py-2 pr-4 text-right">Cost</th>
                        <th className="py-2 pr-4">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {usage.events.map((event) => {
                        const eventDateLabel = formatDateTime(event.eventDate) ?? event.eventDate ?? '—';
                        const usageLabel =
                          typeof event.totalTokens === 'number'
                            ? `${event.totalTokens.toLocaleString()} tokens`
                            : `${event.quantity.toLocaleString()} units`;
                        return (
                          <tr key={event.id} className="hover:bg-slate-950/50">
                            <td className="py-3 pr-4 text-slate-100">{eventDateLabel}</td>
                            <td className="py-3 pr-4 text-slate-100">{event.metricType}</td>
                            <td className="py-3 pr-4 text-muted-foreground">
                              {event.projectName ?? '—'}
                            </td>
                            <td className="py-3 pr-4 text-right text-slate-200">
                              {usageLabel}
                            </td>
                            <td className="py-3 pr-4 text-right text-slate-200">
                              {(event.rawCostCents / 100).toFixed(4)}
                            </td>
                            <td className="py-3 pr-4 text-muted-foreground">
                              {event.description ? event.description.slice(0, 120) : '—'}
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
        </>
      )}
    </div>
  );
}




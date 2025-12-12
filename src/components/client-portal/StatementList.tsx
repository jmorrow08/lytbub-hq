'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpDown, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatDate } from '@/lib/date-utils';
import { downloadStatement } from '@/lib/client-portal/download-statement';

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export type StatementRecord = {
  id: string;
  invoiceNumber: string | null;
  status: string;
  createdAt: string;
  dueDate: string | null;
  totalCents: number;
  amountDueCents: number;
  hostedUrl: string | null;
  pdfUrl: string | null;
  publicShareId: string | null;
};

type StatementListProps = {
  statements: StatementRecord[];
  isLoading?: boolean;
  emptyMessage?: string;
  showFilters?: boolean;
  limit?: number;
};

const STATUS_OPTIONS: Array<{ value: 'all' | string; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'open', label: 'Open' },
  { value: 'paid', label: 'Paid' },
  { value: 'draft', label: 'Draft' },
  { value: 'uncollectible', label: 'Uncollectible' },
  { value: 'void', label: 'Voided' },
];

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  open: 'Open',
  paid: 'Paid',
  void: 'Void',
  uncollectible: 'Uncollectible',
};

function formatCurrency(cents: number): string {
  return currency.format(cents / 100);
}

export function StatementList({
  statements,
  isLoading = false,
  emptyMessage = 'No statements available.',
  showFilters = true,
  limit,
}: StatementListProps) {
  const [statusFilter, setStatusFilter] = useState<'all' | string>('all');
  const [sortDesc, setSortDesc] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [downloadTarget, setDownloadTarget] = useState<{ id: string; type: 'csv' | 'pdf' } | null>(
    null,
  );

  const processed = useMemo(() => {
    let list = [...statements];
    if (statusFilter !== 'all') {
      list = list.filter((statement) => statement.status === statusFilter);
    }
    if (searchTerm.trim().length > 0) {
      const query = searchTerm.trim().toLowerCase();
      list = list.filter((statement) => {
        const idMatch = statement.id.toLowerCase().includes(query);
        const numberMatch = (statement.invoiceNumber ?? '').toLowerCase().includes(query);
        return idMatch || numberMatch;
      });
    }
    list.sort((a, b) => {
      const aTime = new Date(a.createdAt).getTime();
      const bTime = new Date(b.createdAt).getTime();
      return sortDesc ? bTime - aTime : aTime - bTime;
    });
    if (typeof limit === 'number' && limit > 0) {
      return list.slice(0, limit);
    }
    return list;
  }, [statements, statusFilter, searchTerm, sortDesc, limit]);

  return (
    <div className="space-y-4">
      {showFilters && (
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex gap-3">
            <Select
              value={statusFilter}
              onValueChange={(value: string) => setStatusFilter(value as 'all' | string)}
            >
              <SelectTrigger className="w-40 border-slate-800 bg-slate-950/60 text-xs text-slate-200">
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="border-slate-800 bg-slate-950/60 text-xs text-slate-200"
              onClick={() => setSortDesc((prev) => !prev)}
            >
              <ArrowUpDown className="mr-2 h-3 w-3" />
              {sortDesc ? 'Newest first' : 'Oldest first'}
            </Button>
          </div>
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search invoice # or ID"
              className="pl-9 border-slate-800 bg-slate-950/60 text-sm text-slate-100"
            />
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-md border border-slate-900/80">
        <table className="min-w-full divide-y divide-slate-900/60 text-sm">
          <thead className="bg-slate-950/60 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Invoice</th>
              <th className="px-4 py-3 text-left">Issued</th>
              <th className="px-4 py-3 text-left">Due</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-right">Balance</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-900/60 bg-slate-950/40 text-slate-100">
            {processed.map((invoice) => {
              const dueDateLabel = invoice.dueDate ? formatDate(invoice.dueDate) : null;
              return (
                <tr key={invoice.id} className="hover:bg-slate-900/60">
                  <td className="px-4 py-3 font-medium">
                    {invoice.invoiceNumber ?? `Invoice ${invoice.id.slice(0, 8)}`}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(invoice.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {dueDateLabel ?? 'Due on receipt'}
                  </td>
                  <td className="px-4 py-3 text-right">{formatCurrency(invoice.totalCents)}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(invoice.amountDueCents)}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-200">
                      {STATUS_LABEL[invoice.status] ?? invoice.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/client/statements/${invoice.id}`}>View</Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={
                          downloadTarget?.id === invoice.id && downloadTarget?.type === 'csv'
                        }
                        onClick={async () => {
                          setDownloadTarget({ id: invoice.id, type: 'csv' });
                          try {
                            await downloadStatement(invoice.id, 'csv');
                          } catch (error) {
                            console.error('Failed to download CSV', error);
                            window.alert(
                              error instanceof Error
                                ? error.message
                                : 'Unable to download statement.',
                            );
                          } finally {
                            setDownloadTarget(null);
                          }
                        }}
                      >
                        CSV
                      </Button>
                      {invoice.pdfUrl && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={
                            downloadTarget?.id === invoice.id && downloadTarget?.type === 'pdf'
                          }
                          onClick={async () => {
                            setDownloadTarget({ id: invoice.id, type: 'pdf' });
                            try {
                              await downloadStatement(invoice.id, 'pdf');
                            } catch (error) {
                              console.error('Failed to download PDF', error);
                              window.alert(
                                error instanceof Error
                                  ? error.message
                                  : 'Unable to download statement.',
                              );
                            } finally {
                              setDownloadTarget(null);
                            }
                          }}
                        >
                          PDF
                        </Button>
                      )}
                      {invoice.hostedUrl && invoice.status === 'open' && (
                        <Button variant="default" size="sm" asChild>
                          <Link href={invoice.hostedUrl} target="_blank" rel="noreferrer">
                            Pay
                          </Link>
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {processed.length === 0 && !isLoading && (
        <div className="rounded-md border border-slate-900/60 bg-slate-950/60 px-4 py-6 text-center text-sm text-muted-foreground">
          {emptyMessage}
        </div>
      )}

      {isLoading && <div className="text-sm text-muted-foreground">Loading statements…</div>}
    </div>
  );
}




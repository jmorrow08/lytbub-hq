import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { PublicInvoiceView } from '@/lib/invoice-portal';
import { formatDate } from '@/lib/date-utils';

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

const statusLabel: Record<string, string> = {
  draft: 'Draft',
  open: 'Open',
  paid: 'Paid',
  void: 'Void',
  pending: 'Pending',
  overdue: 'Overdue',
};

export function InvoiceHeader({ invoice }: { invoice: PublicInvoiceView }) {
  const formattedDue = formatDate(invoice.dueDate) ?? 'On receipt';
  const amountDue = currency.format(invoice.amountDueCents / 100);
  const status = statusLabel[invoice.status] ?? invoice.status;
  const payUrl = invoice.hostedUrl ?? invoice.pdfUrl ?? null;

  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-slate-800 pb-5">
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-400">Lytbub AI Systems</p>
        <h1 className="text-3xl font-semibold tracking-tight mt-1">AI Service Statement</h1>
        <p className="text-sm text-slate-400 mt-1">
          {invoice.clientCompany ?? invoice.clientName} • {invoice.portalPayload.periodLabel ?? 'Billing'}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <Badge variant="secondary">{status}</Badge>
          <span className="text-xs text-slate-400">Invoice #{invoice.invoiceNumber ?? 'TBD'}</span>
        </div>
      </div>

      <div className="flex flex-col items-start md:items-end gap-3">
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-slate-400">Amount Due</div>
          <div className="text-2xl font-semibold">{amountDue}</div>
          <div className="text-xs text-slate-500">Due {formattedDue}</div>
        </div>
        {payUrl && (
          <Button asChild className="w-full md:w-auto">
            <a href={payUrl} target="_blank" rel="noreferrer">
              Pay securely
            </a>
          </Button>
        )}
      </div>
    </header>
  );
}

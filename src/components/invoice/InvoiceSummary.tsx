import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { PublicInvoiceView } from '@/lib/invoice-portal';

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function InvoiceSummary({ invoice }: { invoice: PublicInvoiceView }) {
  return (
    <Card className="bg-slate-900/70 border-slate-800">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-slate-200">Invoice Breakdown</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          {invoice.lineItems.map((item) => (
            <div
              key={item.id}
              className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3 last:border-0 last:pb-0"
            >
              <div>
                <div className="font-medium text-slate-50">{item.label}</div>
                {item.description && (
                  <div className="text-xs text-slate-400 mt-0.5">{item.description}</div>
                )}
                <div className="text-[11px] text-slate-500 mt-1">
                  {item.quantity} × {currency.format(item.unitAmountCents / 100)}
                  {item.category ? ` • ${item.category}` : ''}
                </div>
              </div>
              <div className="font-semibold text-slate-50">
                {currency.format(item.totalAmountCents / 100)}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-1 text-sm pt-2 border-t border-slate-800">
          <Row label="Subtotal" value={currency.format(invoice.subtotalCents / 100)} />
          {invoice.taxCents > 0 && (
            <Row label="Tax" value={currency.format(invoice.taxCents / 100)} />
          )}
          <Row
            label="Total"
            value={currency.format(invoice.totalCents / 100)}
            className="font-semibold text-slate-50"
          />
          <Row
            label="Outstanding"
            value={currency.format(invoice.amountDueCents / 100)}
            className="text-emerald-400"
          />
          {invoice.pdfUrl && (
            <div className="text-[11px] text-slate-500 mt-2">
              Need a PDF?{' '}
              <a
                href={invoice.pdfUrl}
                target="_blank"
                rel="noreferrer"
                className="text-emerald-400 hover:underline"
              >
                Download here
              </a>
              .
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-between ${className ?? ''}`}>
      <span className="text-slate-400">{label}</span>
      <span>{value}</span>
    </div>
  );
}

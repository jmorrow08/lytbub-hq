import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { PublicInvoiceView } from '@/lib/invoice-portal';

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function InvoiceUsageBreakdown({ invoice }: { invoice: PublicInvoiceView }) {
  const usage = invoice.portalPayload.usageDetails ?? [];

  return (
    <Card className="bg-slate-900/70 border-slate-800">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-slate-200">
          Tooling &amp; Infrastructure Usage
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {usage.length === 0 && (
          <p className="text-xs text-slate-500">
            No usage-based fees recorded for this period.
          </p>
        )}

        {usage.map((item, idx) => (
          <div
            key={item.id ?? idx}
            className="border border-slate-800 rounded-md p-3 bg-slate-950/60"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="font-semibold text-slate-100">{item.toolName}</div>
              {typeof item.billedAmount === 'number' && (
                <div className="text-slate-50 font-semibold">
                  {currency.format(item.billedAmount)}
                </div>
              )}
            </div>
            {item.description && (
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">{item.description}</p>
            )}
            <div className="text-[11px] text-slate-500 mt-1">
              {typeof item.rawCost === 'number' && (
                <span>Raw: {currency.format(item.rawCost)}</span>
              )}
              {typeof item.markupPercent === 'number' && (
                <span>
                  {typeof item.rawCost === 'number' ? ' • ' : ''}
                  Markup: {item.markupPercent}%
                </span>
              )}
            </div>
          </div>
        ))}

        <p className="text-[11px] text-slate-500 pt-2 border-t border-slate-900">
          Usage reflects AI APIs, infra, and orchestration tied to your project. It scales with how
          heavily we exercise the system on your behalf.
        </p>
      </CardContent>
    </Card>
  );
}

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { PublicInvoiceView } from '@/lib/invoice-portal';

export function InvoiceShadowSection({ invoice }: { invoice: PublicInvoiceView }) {
  const { shadowItems = [], shadowSummary } = invoice.portalPayload;

  return (
    <Card className="bg-slate-900/70 border-slate-800">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-slate-200">
          Shadow Bill: Real-World Value
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-xs text-slate-400">
          This section is not an amount you are being charged. It frames the market value of the AI
          system and work delivered so you understand the leverage behind the current pricing.
        </p>

        {shadowItems.length === 0 && (
          <p className="text-xs text-slate-500">No shadow value items provided for this period.</p>
        )}

        <div className="grid gap-3 md:grid-cols-3">
          {shadowItems.map((item, idx) => (
            <div
              key={item.id ?? idx}
              className="rounded-md border border-slate-800 bg-slate-950/60 p-3"
            >
              <div className="text-xs font-semibold text-slate-200">{item.label}</div>
              <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">
                {item.description}
              </p>
              {typeof item.impliedValue === 'number' && (
                <div className="mt-2 text-xs text-slate-200">
                  Implied value: ~${item.impliedValue.toLocaleString()}
                </div>
              )}
              {item.isComplimentary && (
                <div className="mt-1 text-[11px] text-emerald-400">Included at no extra cost.</div>
              )}
              {typeof item.hours === 'number' && typeof item.marketRatePerHour === 'number' && (
                <div className="mt-1 text-[11px] text-slate-500">
                  {item.hours} hrs × ${item.marketRatePerHour.toFixed(2)}/hr
                </div>
              )}
            </div>
          ))}
        </div>

        {shadowSummary && (
          <div className="mt-2 border-t border-slate-800 pt-3 grid gap-3 md:grid-cols-3 text-xs">
            <div>
              <div className="text-slate-400">Total implied value</div>
              <div className="text-slate-50 font-semibold">
                ~${(shadowSummary.totalImpliedValue ?? 0).toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-slate-400">Complimentary value</div>
              <div className="text-emerald-400 font-semibold">
                ~${(shadowSummary.complimentaryValue ?? 0).toLocaleString()}
              </div>
            </div>
            {shadowSummary.note && (
              <p className="text-[11px] text-slate-400 md:col-span-1">{shadowSummary.note}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

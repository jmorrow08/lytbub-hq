import { AiInvoiceChatWidget } from './AiInvoiceChatWidget';
import { InvoiceHeader } from './InvoiceHeader';
import { InvoiceShadowSection } from './InvoiceShadowSection';
import { InvoiceSummary } from './InvoiceSummary';
import { InvoiceUsageBreakdown } from './InvoiceUsageBreakdown';
import type { PublicInvoiceView } from '@/lib/invoice-portal';

export function InvoicePageShell({ invoice }: { invoice: PublicInvoiceView }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col">
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-8 md:px-6 md:py-10 space-y-6">
        <InvoiceHeader invoice={invoice} />
        <div className="grid gap-6 md:grid-cols-[2fr,1.2fr] items-start">
          <InvoiceSummary invoice={invoice} />
          <InvoiceUsageBreakdown invoice={invoice} />
        </div>
        <InvoiceShadowSection invoice={invoice} />
      </main>
      <AiInvoiceChatWidget invoice={invoice} />
    </div>
  );
}

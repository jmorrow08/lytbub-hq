export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { InvoicePageShell } from '@/components/invoice/InvoicePageShell';
import type { PublicInvoiceView } from '@/lib/invoice-portal';

type PageParams = {
  params: { shareId: string };
};

export default async function InvoiceSharePage({ params }: PageParams) {
  // Resolve origin to call our own public API (avoids any env drift).
  const hdrs = await headers();
  const host = hdrs.get('x-forwarded-host') || hdrs.get('host') || '';
  const proto = hdrs.get('x-forwarded-proto') || 'https';
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || (host ? `${proto}://${host}` : '');

  try {
    const res = await fetch(`${origin}/api/public-invoices/${params.shareId}`, {
      cache: 'no-store',
    });
    const data = (await res.json().catch(() => null)) as {
      ok: boolean;
      invoice?: PublicInvoiceView;
    } | null;
    const invoice = data && data.ok ? (data.invoice as PublicInvoiceView) : null;
    if (!invoice) {
      notFound();
    }
    return <InvoicePageShell invoice={invoice as PublicInvoiceView} />;
  } catch {
    // Fallback: hide internal errors behind 404
    notFound();
  }
}

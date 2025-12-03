import { redirect } from 'next/navigation';
import { fetchPublicInvoice, type PublicInvoiceView } from '@/lib/invoice-portal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const normalizeBaseUrl = (): string | null => {
  const explicit =
    process.env.PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
  if (!explicit) {
    return null;
  }
  return explicit.replace(/\/$/, '');
};

const fetchInvoiceWithFallback = async (shareId: string): Promise<PublicInvoiceView | null> => {
  try {
    const primary = await fetchPublicInvoice(shareId);
    if (primary) {
      return primary;
    }
  } catch (error) {
    console.error('[invoice-share] primary lookup failed', error);
  }

  const baseUrl = normalizeBaseUrl();
  if (!baseUrl) {
    return null;
  }

  try {
    const response = await fetch(`${baseUrl}/api/public-invoices/${shareId}`, {
      cache: 'no-store',
      headers: { 'x-invoice-share-fallback': '1' },
    });
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as { ok?: boolean; invoice?: PublicInvoiceView };
    return payload.ok ? payload.invoice ?? null : null;
  } catch (error) {
    console.error('[invoice-share] fallback lookup failed', error);
    return null;
  }
};

export default async function InvoiceShareRedirect({ params }: { params: { shareId: string } }) {
  const shareId = params.shareId;
  if (!shareId) {
    redirect('/client/signup');
  }

  const invoice = await fetchInvoiceWithFallback(shareId);
  const query = new URLSearchParams({ share: shareId });
  if (invoice) {
    query.set('redirect', `/client/statements/${invoice.id}`);
  }

  redirect(`/client/signup?${query.toString()}`);
}

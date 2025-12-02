import { notFound, redirect } from 'next/navigation';
import { fetchPublicInvoice } from '@/lib/invoice-portal';

export default async function InvoiceShareRedirect({ params }: { params: { shareId: string } }) {
  const invoice = await fetchPublicInvoice(params.shareId);
  if (!invoice) {
    notFound();
  }

  const destination = `/client/signup?share=${encodeURIComponent(
    params.shareId,
  )}&redirect=${encodeURIComponent(`/client/statements/${invoice.id}`)}`;
  redirect(destination);
}

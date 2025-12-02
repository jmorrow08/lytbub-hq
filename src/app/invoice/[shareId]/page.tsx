export const dynamic = 'force-dynamic';
import { notFound } from 'next/navigation';
import { fetchPublicInvoice } from '@/lib/invoice-portal';
import { InvoicePageShell } from '@/components/invoice/InvoicePageShell';

type PageParams = {
  params: { shareId: string };
};

export default async function InvoiceSharePage({ params }: PageParams) {
  const invoice = await fetchPublicInvoice(params.shareId);

  if (!invoice) {
    notFound();
  }

  return <InvoicePageShell invoice={invoice} />;
}

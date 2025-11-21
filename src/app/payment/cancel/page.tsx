import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { fetchPaymentDetails } from '../_lib/get-payment';

export const metadata: Metadata = {
  title: 'Payment canceled • Lytbub HQ',
};

type SearchParams = { [key: string]: string | string[] | undefined };

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const getParamValue = (value: string | string[] | undefined) => {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
};

const formatCurrency = (amountCents: number, currency?: string | null) => {
  const normalizedCurrency = currency?.toUpperCase() || 'USD';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: normalizedCurrency,
  }).format(amountCents / 100);
};

const InfoRow = ({ label, value }: { label: string; value: ReactNode }) => (
  <div className="rounded-lg border bg-muted/40 px-4 py-3 text-left">
    <p className="text-sm text-muted-foreground">{label}</p>
    <p className="text-lg font-medium text-foreground">{value}</p>
  </div>
);

export default async function PaymentCancelPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const paymentId = getParamValue(searchParams.paymentId);
  const payment = paymentId ? await fetchPaymentDetails(paymentId) : null;
  const amountDisplay =
    payment && Number.isFinite(payment.amount_cents)
      ? formatCurrency(payment.amount_cents, payment.currency)
      : null;

  const metadata = {
    linkUrl: payment?.url || '/finance',
  };

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <Card className="w-full max-w-2xl shadow-lg">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-rose-500/10 text-rose-500">
            <XCircle className="h-8 w-8" aria-hidden="true" />
          </div>
          <CardTitle className="text-3xl font-semibold">Payment canceled</CardTitle>
          <p className="text-muted-foreground">
            {payment?.project?.name
              ? `No worries—${payment.project.name} hasn't been charged. You can try again whenever you're ready.`
              : 'No worries—you can restart the checkout flow whenever you are ready.'}
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {payment ? (
            <>
              {amountDisplay && <InfoRow label="Amount" value={<span className="text-2xl">{amountDisplay}</span>} />}

              {payment.project?.name && (
                <InfoRow label="Client project" value={payment.project.name} />
              )}

              {payment.description && (
                <InfoRow label="Description" value={payment.description} />
              )}

              <InfoRow
                label="Created at"
                value={dateFormatter.format(new Date(payment.created_at))}
              />

              <p className="text-xs text-muted-foreground text-center">
                Payment ID: <span className="font-mono">{payment.id}</span>
              </p>
            </>
          ) : (
            <div className="rounded-lg border border-dashed bg-muted/40 px-4 py-6 text-center">
              <p className="text-sm text-muted-foreground">
                We couldn&rsquo;t find details for this payment link. Please contact the Lytbub team if
                you need help restarting checkout.
              </p>
            </div>
          )}

          <Button asChild className="w-full">
            <Link href={metadata.linkUrl}>Retry payment</Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href="/">Back to the app</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

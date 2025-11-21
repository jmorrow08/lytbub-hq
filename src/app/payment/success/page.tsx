import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { fetchPaymentDetails } from '../_lib/get-payment';

export const metadata: Metadata = {
  title: 'Payment success • Lytbub HQ',
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

export default async function PaymentSuccessPage({
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

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <Card className="w-full max-w-2xl shadow-lg">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
            <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
          </div>
          <CardTitle className="text-3xl font-semibold">Payment received</CardTitle>
          <p className="text-muted-foreground">
            {payment?.project?.name
              ? `Thanks! We've recorded this payment for ${payment.project.name}.`
              : "Thanks for your payment. We've logged the transaction in Lytbub HQ."}
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {payment ? (
            <>
              {amountDisplay && <InfoRow label="Amount paid" value={<span className="text-3xl">{amountDisplay}</span>} />}

              {payment.project?.name && <InfoRow label="Client project" value={payment.project.name} />}

              {payment.description && (
                <InfoRow label="Description" value={payment.description} />
              )}

              <InfoRow
                label="Processed at"
                value={dateFormatter.format(new Date(payment.created_at))}
              />

              <p className="text-xs text-muted-foreground text-center">
                Payment ID: <span className="font-mono">{payment.id}</span>
              </p>
            </>
          ) : (
            <div className="rounded-lg border border-dashed bg-muted/40 px-4 py-6 text-center">
              <p className="text-sm text-muted-foreground">
                We couldn&rsquo;t load this payment. If you just completed checkout, please share the
                link with the Lytbub team so we can verify it manually.
              </p>
            </div>
          )}

          <Button asChild className="w-full">
            <Link href="/">Back to the app</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

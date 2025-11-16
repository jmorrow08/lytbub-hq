import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Payment success • Lytbub HQ',
};

type SearchParams = { [key: string]: string | string[] | undefined };

const getParamValue = (value: string | string[] | undefined) => {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
};

const formatAmount = (params: SearchParams) => {
  const centsParam =
    getParamValue(params.amountCents) ||
    getParamValue(params.amount_cents) ||
    getParamValue(params.totalCents);
  const dollarsParam = getParamValue(params.amount) || getParamValue(params.total);
  const currencyParam = getParamValue(params.currency);

  let amount = 0;
  if (centsParam && Number.isFinite(Number(centsParam))) {
    amount = Number(centsParam) / 100;
  } else if (dollarsParam && Number.isFinite(Number(dollarsParam))) {
    amount = Number(dollarsParam);
  } else {
    return null;
  }

  const currency = (currencyParam || 'USD').toUpperCase();
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  } catch {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  }
};

export default function PaymentSuccessPage({ searchParams }: { searchParams: SearchParams }) {
  const amountDisplay = formatAmount(searchParams);
  const clientName =
    getParamValue(searchParams.clientName) ||
    getParamValue(searchParams.client) ||
    getParamValue(searchParams.projectName) ||
    null;

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <Card className="w-full max-w-xl text-center shadow-lg">
        <CardHeader className="space-y-4">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
            <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
          </div>
          <CardTitle className="text-3xl font-semibold">Payment received</CardTitle>
          <p className="text-muted-foreground">
            {clientName
              ? `Thanks! We've recorded this payment for ${clientName}.`
              : "Thanks for your payment. We've logged the transaction in Lytbub HQ."}
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {amountDisplay && (
            <div className="rounded-lg border bg-muted/40 px-4 py-3">
              <p className="text-sm text-muted-foreground">Amount paid</p>
              <p className="text-3xl font-semibold">{amountDisplay}</p>
            </div>
          )}

          {clientName && (
            <div className="rounded-lg border bg-muted/40 px-4 py-3 text-left">
              <p className="text-sm text-muted-foreground">Client project</p>
              <p className="text-lg font-medium text-foreground">{clientName}</p>
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

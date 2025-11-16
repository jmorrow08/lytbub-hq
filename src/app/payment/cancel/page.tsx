import type { Metadata } from 'next';
import Link from 'next/link';
import { XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Payment canceled • Lytbub HQ',
};

type SearchParams = { [key: string]: string | string[] | undefined };

const getParamValue = (value: string | string[] | undefined) => {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
};

export default function PaymentCancelPage({ searchParams }: { searchParams: SearchParams }) {
  const retryUrl =
    getParamValue(searchParams.retryUrl) ||
    getParamValue(searchParams.retry) ||
    getParamValue(searchParams.returnTo) ||
    '/finance';
  const clientName =
    getParamValue(searchParams.clientName) ||
    getParamValue(searchParams.client) ||
    getParamValue(searchParams.projectName);

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <Card className="w-full max-w-xl text-center shadow-lg">
        <CardHeader className="space-y-4">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-rose-500/10 text-rose-500">
            <XCircle className="h-8 w-8" aria-hidden="true" />
          </div>
          <CardTitle className="text-3xl font-semibold">Payment canceled</CardTitle>
          <p className="text-muted-foreground">
            {clientName
              ? `No worries—${clientName} hasn't been charged. You can try the payment again when ready.`
              : 'No worries—you can restart the checkout flow whenever you are ready.'}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button asChild className="w-full">
            <Link href={retryUrl}>Try again</Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href="/">Back to the app</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

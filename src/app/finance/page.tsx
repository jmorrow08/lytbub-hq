'use client';
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/supabaseClient';
import { getClientProjects, getPayments } from '@/lib/api';
import type { Payment, Project } from '@/types';
import { Loader2, Copy, ExternalLink } from 'lucide-react';
import { runFinanceBackfills } from '@/lib/maintenance';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

type CheckoutResponse = {
  url?: string;
  paymentId?: string;
  error?: string;
};

async function callSupabaseCheckoutFunction(
  accessToken: string,
  payload: { amountCents: number; description?: string; projectId?: string }
): Promise<CheckoutResponse> {
  try {
    const { data, error } = await supabase.functions.invoke('stripe_checkout_create', {
      body: payload,
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (error) {
      return { error: error.message || 'Payment service returned an error.' };
    }
    return (data as unknown as CheckoutResponse) || {};
  } catch {
    return { error: 'Unable to reach payment service. Please try again later.' };
  }
}

export default function FinancePage() {
  const [clientProjects, setClientProjects] = useState<Project[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkResult, setLinkResult] = useState<{ url: string; paymentId: string } | null>(null);
  const [formData, setFormData] = useState({
    amount: '',
    description: '',
    projectId: '',
  });

  const hasClients = useMemo(() => clientProjects.length > 0, [clientProjects]);

  const loadFinanceData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [paymentsData, clientData] = await Promise.all([getPayments(), getClientProjects()]);
      setPayments(paymentsData);
      setClientProjects(clientData);
    } catch (err) {
      console.error(err);
      setError('Unable to load finance data. Please ensure you are signed in.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runFinanceBackfills().finally(loadFinanceData);
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const amountValue = parseFloat(formData.amount);

    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setError('Enter a positive payment amount.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setLinkResult(null);

    try {
      const { data: session } = await supabase.auth.getSession();
      const accessToken = session.session?.access_token;
      if (!accessToken) {
        throw new Error('You must be signed in to create a payment link.');
      }

      const res = await fetch('/api/finance/create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          amountCents: Math.round(amountValue * 100),
          description: formData.description.trim() || undefined,
          projectId: formData.projectId || undefined,
        }),
      });

      let data: CheckoutResponse;
      if (res.status === 404) {
        // Fallback: call Supabase Edge Function directly when API route is unavailable
        data = await callSupabaseCheckoutFunction(accessToken, {
          amountCents: Math.round(amountValue * 100),
          description: formData.description.trim() || undefined,
          projectId: formData.projectId || undefined,
        });
      } else {
        data = (await res.json()) as CheckoutResponse;
      }

      if (!res.ok && res.status !== 404) {
        throw new Error(data?.error || 'Failed to create checkout link');
      }
      if (!data?.url || !data?.paymentId) {
        throw new Error(data?.error || 'Failed to create checkout link');
      }

      setLinkResult({ url: data.url, paymentId: data.paymentId });
      setFormData({ amount: '', description: '', projectId: '' });
      loadFinanceData();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to create payment link');
    } finally {
      setSubmitting(false);
    }
  };

  const copyToClipboard = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
    } catch (err) {
      console.error('Clipboard error', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading finance data…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Finance</h1>
          <p className="text-muted-foreground">
            Generate test-mode Stripe checkout links and keep a ledger of payments.
          </p>
        </div>
        <div className="text-xs text-muted-foreground text-right">
          <p className="font-medium uppercase tracking-wide">Stripe Test Mode</p>
          <p>Use card 4242 4242 4242 4242 for mock payments.</p>
        </div>
      </div>

      {error && (
        <Card className="border-red-500/30 bg-red-500/10">
          <CardContent className="py-4 text-sm text-red-600 dark:text-red-400">
            {error}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Create Payment Link</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="amount" className="block text-sm font-medium mb-1">
                  Amount (USD) *
                </label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="150.00"
                  value={formData.amount}
                  onChange={(e) => setFormData((prev) => ({ ...prev, amount: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label htmlFor="description" className="block text-sm font-medium mb-1">
                  Description
                </label>
                <Input
                  id="description"
                  placeholder="Maintenance retainer, Cleveland Clean, etc."
                  value={formData.description}
                  onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                />
              </div>
              <div>
                <label htmlFor="projectId" className="block text-sm font-medium mb-1">
                  Client Project (optional)
                </label>
                <select
                  id="projectId"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={formData.projectId}
                  onChange={(e) => setFormData((prev) => ({ ...prev, projectId: e.target.value }))}
                >
                  <option value="">No client</option>
                  {clientProjects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
                {!hasClients && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    No client projects yet. Add one via the Projects tab by selecting the Client type.
                  </p>
                )}
              </div>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Creating...' : 'Generate Stripe Link'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {linkResult && (
          <Card>
            <CardHeader>
              <CardTitle>Latest Checkout Session</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Share this link with the client or open it in a new tab to test the Stripe flow.
              </p>
              <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <span className="truncate">{linkResult.url}</span>
                <div className="flex items-center space-x-2 pl-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(linkResult.url)}
                    title="Copy link"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="outline" size="icon" asChild>
                    <Link href={linkResult.url} target="_blank">
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Payment ID: {linkResult.paymentId}</p>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Payments</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No payments logged yet. Generate a checkout link to see it here.
            </p>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2 text-left">Created</th>
                  <th className="py-2 text-left">Client Project</th>
                  <th className="py-2 text-left">Description</th>
                  <th className="py-2 text-left">Amount</th>
                  <th className="py-2 text-left">Type</th>
                  <th className="py-2 text-left">Status</th>
                  <th className="py-2 text-right">Link</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id} className="border-b border-border/40">
                    <td className="py-3">{dateFormatter.format(new Date(payment.created_at))}</td>
                    <td className="py-3">{payment.project?.name || '—'}</td>
                    <td className="py-3">{payment.description || '—'}</td>
                    <td className="py-3 font-medium">
                      {currencyFormatter.format(payment.amount_cents / 100)}
                    </td>
                    <td className="py-3 capitalize">{payment.link_type.replace('_', ' ')}</td>
                    <td className="py-3">{payment.status || 'Pending'}</td>
                    <td className="py-3 text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link href={payment.url} target="_blank">
                          Open
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

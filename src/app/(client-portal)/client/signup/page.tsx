'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/auth/AuthProvider';
import { LoginForm } from '@/components/auth/LoginForm';
import { supabase } from '@/lib/supabaseClient';

const CLIENT_PORTAL_DESTINATION = '/client/dashboard';

type PublicInvoicePreview = {
  ok: boolean;
  invoice?: {
    clientName: string;
  };
};

type LinkState = 'idle' | 'linking' | 'linked' | 'error';

export default function ClientSignupPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const shareId = searchParams?.get('share') ?? null;
  const explicitClientId = searchParams?.get('client') ?? null;
  const redirectParam = searchParams?.get('redirect') ?? null;
  const [invoiceName, setInvoiceName] = useState<string | null>(null);
  const [invoiceStatus, setInvoiceStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [linkState, setLinkState] = useState<LinkState>('idle');
  const [linkError, setLinkError] = useState<string | null>(null);

  const signupPath = useMemo(() => {
    const params = new URLSearchParams();
    if (shareId) params.set('share', shareId);
    if (explicitClientId) params.set('client', explicitClientId);
    if (redirectParam) params.set('redirect', redirectParam);
    return `/client/signup${params.toString() ? `?${params.toString()}` : ''}`;
  }, [shareId, explicitClientId, redirectParam]);

  useEffect(() => {
    if (!shareId) {
      setInvoiceStatus('idle');
      setInvoiceName(null);
      setInvoiceError(null);
      return;
    }

    let isMounted = true;
    setInvoiceStatus('loading');
    setInvoiceError(null);

    fetch(`/api/public-invoices/${shareId}`)
      .then(async (response) => {
        if (!isMounted) return;
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { reason?: string } | null;
          setInvoiceStatus('error');
          setInvoiceError(
            payload?.reason === 'not_found_or_expired'
              ? 'This share link is no longer available.'
              : 'Unable to load invoice details.',
          );
          return;
        }
        const data = (await response.json()) as PublicInvoicePreview;
        const clientName = data.invoice?.clientName ?? null;
        setInvoiceName(clientName);
        setInvoiceStatus('idle');
      })
      .catch((error) => {
        if (!isMounted) return;
        console.error('Failed to load invoice preview', error);
        setInvoiceStatus('error');
        setInvoiceError('Unable to load invoice details.');
      });

    return () => {
      isMounted = false;
    };
  }, [shareId]);

  const linkClientAccount = useCallback(async () => {
    if (!user || (!shareId && !explicitClientId)) {
      return;
    }

    try {
      setLinkState('linking');
      setLinkError(null);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      const token = session?.access_token;
      if (!token) {
        throw new Error('Missing authentication token. Please sign in again.');
      }

      const response = await fetch('/api/auth/client-signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ shareId, clientId: explicitClientId }),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to link account.');
      }

      setLinkState('linked');
      const destination = redirectParam || CLIENT_PORTAL_DESTINATION;
      router.replace(destination);
    } catch (error) {
      console.error('Client signup linking failed', error);
      setLinkState('error');
      setLinkError(error instanceof Error ? error.message : 'Unable to link account.');
    }
  }, [explicitClientId, redirectParam, router, shareId, user]);

  useEffect(() => {
    if (!user || linkState !== 'idle') {
      return;
    }
    if (!shareId && !explicitClientId) {
      return;
    }
    void linkClientAccount();
  }, [explicitClientId, linkClientAccount, linkState, shareId, user]);

  const missingToken = !shareId && !explicitClientId;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <Card className="w-full max-w-xl shadow-lg">
        <CardHeader className="space-y-2 text-center">
          <CardTitle className="text-2xl font-semibold">Client portal access</CardTitle>
          <p className="text-sm text-muted-foreground">
            {invoiceName
              ? `Create or sign in to access ${invoiceName}'s billing portal.`
              : 'Create or sign in to access your billing portal.'}
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {missingToken ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              This signup link is missing required information. Please use the latest email invite
              you received.
            </div>
          ) : invoiceStatus === 'error' ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {invoiceError}
            </div>
          ) : null}

          {invoiceStatus === 'loading' && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Fetching invoice details…
            </div>
          )}

          {!loading && !user && !missingToken && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Sign in or create an account using your work email. You can also continue with
                Google if that email is tied to your billing access.
              </p>
              <LoginForm defaultRedirect={signupPath} />
            </div>
          )}

          {user && !missingToken && (
            <div className="space-y-4">
              <div className="rounded-md border border-border/60 bg-muted/10 px-3 py-2 text-sm text-muted-foreground">
                <p>Signed in as {user.email ?? 'your account'}.</p>
                <p className="text-xs text-muted-foreground/80">
                  We will link this account to the billing portal once the invitation is validated.
                </p>
              </div>
              {linkState === 'linking' && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Linking your access…
                </div>
              )}
              {linkState === 'error' && (
                <div className="space-y-3">
                  <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    {linkError}
                  </div>
                  <Button onClick={linkClientAccount} variant="outline">
                    Try again
                  </Button>
                </div>
              )}
              {linkState === 'linked' && (
                <div className="space-y-3">
                  <div className="rounded-md border border-green-500/40 bg-green-500/10 px-3 py-2 text-sm text-green-600">
                    Your account is linked. Redirecting to your portal…
                  </div>
                  <Button onClick={() => router.replace(CLIENT_PORTAL_DESTINATION)}>
                    Continue
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

'use client';

import { Suspense, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'pending' | 'error'>('pending');
  const [message, setMessage] = useState<string>('Completing sign-in…');

  useEffect(() => {
    const code = searchParams.get('code');
    const errorDescription = searchParams.get('error_description');
    const next = searchParams.get('next') || '/';

    if (errorDescription) {
      // Use setTimeout to avoid synchronous setState in effect
      setTimeout(() => {
        setStatus('error');
        setMessage(errorDescription);
      }, 0);
      return;
    }

    if (!code) {
      router.replace(next);
      return;
    }

    const finalize = async () => {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        setStatus('error');
        setMessage(error.message);
        return;
      }

      router.replace(next);
    };

    finalize().catch((error) => {
      console.error('OAuth callback exchange failed', error);
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Unexpected OAuth error.');
    });
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="flex items-center gap-3 rounded-md border border-border/60 bg-background px-4 py-3 text-sm text-muted-foreground">
        {status === 'pending' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <span className="font-medium text-destructive">Alert:</span>
        )}
        <span>{message}</span>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center px-4">
          <div className="flex items-center gap-3 rounded-md border border-border/60 bg-background px-4 py-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading…</span>
          </div>
        </div>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}

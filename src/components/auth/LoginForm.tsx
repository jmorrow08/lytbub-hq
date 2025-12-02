'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Lock } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuth } from './AuthProvider';

type Mode = 'sign-in' | 'sign-up';

type LoginFormProps = {
  defaultRedirect?: string;
};

export function LoginForm({ defaultRedirect }: LoginFormProps = {}) {
  const { signIn, signUp, signInWithProvider, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ email: '', password: '' });
  const [submitting, setSubmitting] = useState(false);
  const [oauthRedirecting, setOauthRedirecting] = useState(false);

  const redirectTarget = useMemo(() => {
    const requested = searchParams?.get('redirect') ?? defaultRedirect;
    if (!requested) return '/';
    try {
      // Ensure redirect stays on same origin
      const baseOrigin =
        typeof window !== 'undefined' ? window.location.origin : 'https://example.com';
      const url = new URL(requested, baseOrigin);
      return url.pathname + url.search + url.hash;
    } catch {
      return '/';
    }
  }, [searchParams, defaultRedirect]);

  useEffect(() => {
    if (status) {
      const timer = window.setTimeout(() => setStatus(null), 5000);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [status]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setStatus(null);
    setError(null);

    const trimmedEmail = form.email.trim().toLowerCase();
    const trimmedPassword = form.password.trim();

    try {
      const result =
        mode === 'sign-in'
          ? await signIn(trimmedEmail, trimmedPassword)
          : await signUp(trimmedEmail, trimmedPassword);

      if (result.error) {
        setError(result.error);
      } else if (mode === 'sign-in') {
        router.replace(redirectTarget);
      } else if (result.message) {
        setStatus(result.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const toggleMode = () => {
    setMode((prev) => (prev === 'sign-in' ? 'sign-up' : 'sign-in'));
    setStatus(null);
    setError(null);
  };

  const handleGoogleSignIn = async () => {
    setOauthRedirecting(true);
    setStatus(null);
    setError(null);
    try {
      const result = await signInWithProvider('google', { redirectTo: redirectTarget });
      if (result.error) {
        setError(result.error);
      } else if (result.message) {
        setStatus(result.message);
      }
    } finally {
      setOauthRedirecting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Lock className="h-5 w-5" />
          </div>
          <CardTitle className="text-2xl font-semibold">
            {mode === 'sign-in' ? 'Sign in to Lytbub HQ' : 'Create your Lytbub HQ account'}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Use the same credentials you manage in Supabase Auth
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={loading || oauthRedirecting}
              onClick={handleGoogleSignIn}
            >
              {oauthRedirecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Continue with Google
            </Button>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border/60" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">or</span>
              </div>
            </div>
          </div>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-muted-foreground">
                Email
              </label>
              <Input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                disabled={loading || submitting}
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-muted-foreground">
                Password
              </label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                placeholder="••••••••"
                disabled={loading || submitting}
                value={form.password}
                onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                required
              />
            </div>

            {(status || error) && (
              <div
                className={`rounded-md border px-3 py-2 text-sm ${
                  error
                    ? 'border-destructive/40 text-destructive'
                    : 'border-green-500/40 text-green-600'
                }`}
              >
                {error || status}
              </div>
            )}

            <Button
              className="w-full"
              type="submit"
              disabled={loading || submitting || oauthRedirecting}
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === 'sign-in' ? 'Sign in' : 'Sign up'}
            </Button>
          </form>
          <div className="mt-6 text-center text-sm text-muted-foreground">
            {mode === 'sign-in' ? (
              <>
                Need an account?{' '}
                <button
                  type="button"
                  className="font-medium text-primary hover:underline"
                  onClick={toggleMode}
                >
                  Create one
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  className="font-medium text-primary hover:underline"
                  onClick={toggleMode}
                >
                  Sign in
                </button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

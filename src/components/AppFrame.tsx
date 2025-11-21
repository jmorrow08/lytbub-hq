'use client';

import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from './auth/AuthProvider';
import { LoginForm } from './auth/LoginForm';
import { Navigation } from './Navigation';
import { FocusModeProvider } from './mode/FocusModeProvider';

export function AppFrame({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Checking your session…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginForm />;
  }

  return (
    <FocusModeProvider>
      <div className="min-h-screen bg-background text-foreground">
        <Navigation />
        <main className="container mx-auto px-4 py-8">{children}</main>
      </div>
    </FocusModeProvider>
  );
}

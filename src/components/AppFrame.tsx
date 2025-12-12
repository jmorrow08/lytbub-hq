'use client';

import { type ReactNode, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from './auth/AuthProvider';
import { LoginForm } from './auth/LoginForm';
import { Navigation } from './Navigation';
import { FocusModeProvider } from './mode/FocusModeProvider';
import { UserFeaturesProvider } from './features/UserFeaturesProvider';
import { Button } from './ui/button';

type PortalStatus = 'unknown' | 'checking' | 'full' | 'client-only' | 'error';

export function AppFrame({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [portalStatus, setPortalStatus] = useState<PortalStatus>('unknown');
  const [portalError, setPortalError] = useState<string | null>(null);
  const [portalCheckKey, setPortalCheckKey] = useState(0);

  useEffect(() => {
    let isActive = true;

    if (!user?.id) {
      setPortalStatus('unknown');
      setPortalError(null);
      return () => {
        isActive = false;
      };
    }

    setPortalStatus('checking');
    setPortalError(null);

    const loadPortalAccess = async () => {
      try {
        const { data, error } = await supabase
          .from('client_users')
          .select('role')
          .eq('user_id', user.id);

        if (!isActive) return;

        if (error) {
          console.error('Unable to verify client portal access', error);
          setPortalStatus('error');
          setPortalError('Unable to verify your access level. Please try again.');
          return;
        }

        const rows = data ?? [];
        const hasMembership = rows.length > 0;
        const hasOwnerRole = rows.some((row) => row.role === 'owner');
        if (hasMembership && !hasOwnerRole) {
          setPortalStatus('client-only');
        } else {
          setPortalStatus('full');
        }
      } catch (error) {
        if (!isActive) return;
        console.error('Unexpected portal access error', error);
        setPortalStatus('error');
        setPortalError('Unable to verify your access level. Please try again.');
      }
    };

    void loadPortalAccess();

    return () => {
      isActive = false;
    };
  }, [user?.id, portalCheckKey]);

  const retryPortalCheck = () => setPortalCheckKey((key) => key + 1);

  const checkingPortal =
    Boolean(user) && (portalStatus === 'unknown' || portalStatus === 'checking');

  if (loading || checkingPortal) {
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

  if (portalStatus === 'client-only') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4 max-w-md px-6">
          <div className="space-y-2">
            <p className="text-lg font-semibold">Billing portal access only</p>
            <p className="text-sm text-muted-foreground">
              This account is limited to the billing dashboard. You can review statements and usage
              from the client portal.
            </p>
          </div>
          <Button onClick={() => router.replace('/client/dashboard')}>Open billing dashboard</Button>
        </div>
      </div>
    );
  }

  if (portalStatus === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4 max-w-md px-6">
          <div className="space-y-2">
            <p className="text-lg font-semibold">We couldn’t confirm your access</p>
            <p className="text-sm text-muted-foreground">{portalError}</p>
          </div>
          <Button variant="outline" onClick={retryPortalCheck}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <FocusModeProvider>
      <UserFeaturesProvider>
        <div className="min-h-screen bg-background text-foreground">
          <Navigation />
          <main className="container mx-auto px-4 py-8">{children}</main>
        </div>
      </UserFeaturesProvider>
    </FocusModeProvider>
  );
}

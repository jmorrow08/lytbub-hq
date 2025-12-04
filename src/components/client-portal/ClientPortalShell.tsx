'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Loader2 } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { LoginForm } from '@/components/auth/LoginForm';
import { supabase } from '@/lib/supabaseClient';
import { ClientPortalNav } from './ClientPortalNav';

export type ClientPortalMembership = {
  id: string;
  name: string;
  companyName: string | null;
  role: 'viewer' | 'admin';
  portalEnabled: boolean;
};

type ClientPortalContextValue = {
  memberships: ClientPortalMembership[];
  activeClientId: string | null;
  loadingMemberships: boolean;
  setActiveClientId: (clientId: string) => void;
  refreshMemberships: () => Promise<void>;
};

const ClientPortalContext = createContext<ClientPortalContextValue | undefined>(undefined);

export function useClientPortalContext(): ClientPortalContextValue {
  const context = useContext(ClientPortalContext);
  if (!context) {
    throw new Error('useClientPortalContext must be used within ClientPortalShell');
  }
  return context;
}

async function fetchMemberships(): Promise<ClientPortalMembership[]> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    throw new Error('Missing auth token. Please sign in again.');
  }

  const response = await fetch('/api/client-portal/memberships', {
    headers: { Authorization: `Bearer ${token}` },
  });

  const payload = (await response.json().catch(() => null)) as {
    clients?: ClientPortalMembership[];
    error?: string;
  } | null;

  if (!response.ok) {
    throw new Error(payload?.error || 'Unable to load client memberships.');
  }

  return payload?.clients ?? [];
}

export function ClientPortalShell({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [memberships, setMemberships] = useState<ClientPortalMembership[]>([]);
  const [activeClientId, setActiveClientIdState] = useState<string | null>(null);
  const [loadingMemberships, setLoadingMemberships] = useState(false);
  const [membershipError, setMembershipError] = useState<string | null>(null);

  const redirectTarget = useMemo(() => {
    const query = searchParams?.toString();
    return `${pathname}${query ? `?${query}` : ''}`;
  }, [pathname, searchParams]);

  const applyActiveClientId = useCallback(
    (clientId: string | null, opts: { updateQuery?: boolean } = { updateQuery: true }) => {
      setActiveClientIdState(clientId);
      if (!opts.updateQuery) {
        return;
      }
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      if (clientId) {
        params.set('client', clientId);
      } else {
        params.delete('client');
      }
      const query = params.toString();
      router.replace(`${pathname}${query ? `?${query}` : ''}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const refreshMemberships = useCallback(async () => {
    if (!user) {
      setMemberships([]);
      applyActiveClientId(null, { updateQuery: false });
      return;
    }
    setLoadingMemberships(true);
    setMembershipError(null);
    try {
      const result = await fetchMemberships();
      setMemberships(result);
      if (result.length === 0) {
        applyActiveClientId(null, { updateQuery: false });
        return;
      }
      const requestedClientId = searchParams?.get('client');
      const fallback = result.find((item) => item.portalEnabled) || result[0];
      const nextClient = result.find((item) => item.id === requestedClientId) ?? fallback;
      applyActiveClientId(nextClient?.id ?? null, { updateQuery: false });
    } catch (error) {
      console.error('Failed to load client memberships', error);
      setMembershipError(error instanceof Error ? error.message : 'Unable to load memberships.');
      applyActiveClientId(null, { updateQuery: false });
    } finally {
      setLoadingMemberships(false);
    }
  }, [applyActiveClientId, searchParams, user]);

  useEffect(() => {
    if (user) {
      void refreshMemberships();
    } else {
      setMemberships([]);
      setMembershipError(null);
      applyActiveClientId(null, { updateQuery: false });
    }
  }, [applyActiveClientId, refreshMemberships, user]);

  const handleSetActiveClientId = useCallback(
    (clientId: string) => {
      applyActiveClientId(clientId);
    },
    [applyActiveClientId],
  );

  const contextValue = useMemo<ClientPortalContextValue>(
    () => ({
      memberships,
      activeClientId,
      loadingMemberships,
      setActiveClientId: handleSetActiveClientId,
      refreshMemberships,
    }),
    [memberships, activeClientId, loadingMemberships, handleSetActiveClientId, refreshMemberships],
  );

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-200">
        <div className="flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking your session…
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-50 px-4">
        <div className="w-full max-w-md">
          <LoginForm defaultRedirect={redirectTarget} />
        </div>
      </div>
    );
  }

  if (loadingMemberships) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-200">
        <div className="flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading billing portal…
        </div>
      </div>
    );
  }

  if (membershipError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-50 px-4">
        <div className="w-full max-w-md space-y-3 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
          <p className="font-medium text-destructive">{membershipError}</p>
          <p className="text-xs text-destructive/80">
            Reach out to your Lytbub HQ contact if you believe this is a mistake.
          </p>
        </div>
      </div>
    );
  }

  if (!memberships.length) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-50 px-4">
        <div className="w-full max-w-md space-y-3 rounded-md border border-border/60 bg-slate-900/80 px-4 py-3 text-sm">
          <p className="font-medium">No billing access yet</p>
          <p className="text-xs text-muted-foreground">
            We could not find any active billing portals for this account. Contact support if you
            need access.
          </p>
        </div>
      </div>
    );
  }

  if (!activeClientId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-50 px-4">
        <div className="w-full max-w-md space-y-3 rounded-md border border-border/60 bg-slate-900/80 px-4 py-3 text-sm">
          <p className="font-medium">Select a client to continue</p>
          <div className="space-y-2">
            {memberships.map((membership) => (
              <button
                key={membership.id}
                type="button"
                onClick={() => handleSetActiveClientId(membership.id)}
                className="w-full rounded-md border border-border/40 bg-slate-950/40 px-3 py-2 text-left text-sm hover:border-primary/60"
              >
                <span className="block font-medium text-slate-100">{membership.name}</span>
                {membership.companyName && (
                  <span className="block text-xs text-muted-foreground">
                    {membership.companyName}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <ClientPortalContext.Provider value={contextValue}>
      <div className="min-h-screen bg-slate-950 text-slate-50">
        <div className="flex min-h-screen flex-col md:flex-row">
          <ClientPortalNav
            memberships={memberships}
            activeClientId={activeClientId}
            onSelectClient={handleSetActiveClientId}
          />
          <main className="flex-1 bg-slate-950/60 px-4 py-6 md:px-8 md:py-8">{children}</main>
        </div>
      </div>
    </ClientPortalContext.Provider>
  );
}





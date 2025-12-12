'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { FeatureFlag } from '@/lib/features';
import { DEFAULT_FEATURES, normalizeFeatures } from '@/lib/features';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '@/lib/supabaseClient';

type UserFeaturesContextValue = {
  features: FeatureFlag[];
  loading: boolean;
  refresh: () => Promise<void>;
};

const UserFeaturesContext = createContext<UserFeaturesContextValue | undefined>(undefined);

export function UserFeaturesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const [features, setFeatures] = useState<FeatureFlag[]>([...DEFAULT_FEATURES]);
  const [loading, setLoading] = useState(false);

  const fetchFeatures = useCallback(async () => {
    if (!user) {
      setFeatures([...DEFAULT_FEATURES]);
      return;
    }
    const impersonateId = searchParams?.get('impersonate');
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const token = session?.access_token;
      // Impersonation preview: fetch target user's features using admin endpoint
      const endpoint = impersonateId ? `/api/admin/users/${impersonateId}/features` : '/api/me/features';

      const response = await fetch(endpoint, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error('Unable to load feature flags');
      }
      const payload = (await response.json()) as { features?: string[] };
      setFeatures(normalizeFeatures({ features: payload.features }));
    } catch (error) {
      console.error('Failed to load user features', error);
      setFeatures([...DEFAULT_FEATURES]);
    } finally {
      setLoading(false);
    }
  }, [searchParams, user]);

  useEffect(() => {
    void fetchFeatures();
  }, [fetchFeatures]);

  const value = useMemo<UserFeaturesContextValue>(
    () => ({
      features,
      loading,
      refresh: fetchFeatures,
    }),
    [features, loading, fetchFeatures],
  );

  return <UserFeaturesContext.Provider value={value}>{children}</UserFeaturesContext.Provider>;
}

export const useUserFeatures = (): UserFeaturesContextValue => {
  const context = useContext(UserFeaturesContext);
  if (!context) {
    throw new Error('useUserFeatures must be used within a UserFeaturesProvider');
  }
  return context;
};

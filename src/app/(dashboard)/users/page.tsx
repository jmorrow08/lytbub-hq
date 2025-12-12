'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useUserFeatures } from '@/components/features/UserFeaturesProvider';
import { useAuth } from '@/components/auth/AuthProvider';
import { supabase } from '@/lib/supabaseClient';
import type { FeatureFlag } from '@/lib/features';

type UserRow = {
  id: string;
  email: string | null;
  features: FeatureFlag[];
  created_at?: string;
};

const FEATURE_LIST: FeatureFlag[] = ['billing', 'dashboard', 'tasks', 'ai_summary', 'admin'];

export default function UsersPage() {
  const { features: myFeatures } = useUserFeatures();
  const { user } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isAdmin = myFeatures.includes('admin');

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => (a.email || '').localeCompare(b.email || ''));
  }, [users]);

  const fetchUsers = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      const response = await fetch('/api/admin/users', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const payload = (await response.json()) as { users?: UserRow[]; error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Unable to load users.');
      }
      setUsers(payload.users ?? []);
    } catch (err) {
      console.error('Admin user load failed', err);
      setError(err instanceof Error ? err.message : 'Unable to load users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchUsers();
  }, [user]);

  const toggleFeature = async (row: UserRow, feature: FeatureFlag) => {
    const next = new Set<FeatureFlag>(row.features);
    if (next.has(feature)) {
      next.delete(feature);
    } else {
      next.add(feature);
    }
    // Always keep billing so users can sign in and pay
    next.add('billing');
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      const response = await fetch(`/api/admin/users/${row.id}/features`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ features: Array.from(next) }),
      });
      const payload = (await response.json()) as { features?: FeatureFlag[]; error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Unable to update features.');
      }
      setUsers((prev) =>
        prev.map((item) =>
          item.id === row.id ? { ...item, features: payload.features ?? Array.from(next) } : item,
        ),
      );
    } catch (err) {
      console.error('Feature update failed', err);
      setError(err instanceof Error ? err.message : 'Unable to update features.');
    }
  };

  if (!isAdmin) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold">Users</h1>
        <Card>
          <CardHeader>
            <CardTitle>Access unavailable</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            You do not have permission to manage users.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Users</h1>
          <p className="text-muted-foreground">
            Toggle product access per user. Billing remains enabled so they can pay.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchUsers} disabled={loading}>
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>User list</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading users…</p>
          ) : sortedUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No users found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-2 pr-4">Email</th>
                    <th className="py-2 pr-4">Features</th>
                    <th className="py-2 pr-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedUsers.map((row) => (
                    <tr key={row.id} className="border-t border-border/60">
                      <td className="py-2 pr-4 align-top">{row.email ?? 'Unknown'}</td>
                      <td className="py-2 pr-4 align-top">
                        <div className="flex flex-wrap gap-2">
                          {FEATURE_LIST.map((feature) => (
                            <button
                              key={`${row.id}-${feature}`}
                              type="button"
                              onClick={() => toggleFeature(row, feature)}
                              className={`rounded-full px-3 py-1 text-xs font-medium border transition ${
                                row.features.includes(feature)
                                  ? 'bg-primary/10 border-primary/40 text-primary'
                                  : 'border-border text-muted-foreground hover:border-primary/40'
                              }`}
                            >
                              {feature}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td className="py-2 pr-4 align-top">
                        <p className="text-xs text-muted-foreground">
                          {row.created_at ? new Date(row.created_at).toLocaleDateString() : ''}
                        </p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

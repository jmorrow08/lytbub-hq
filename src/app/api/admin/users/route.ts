import { NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/auth/client-auth';
import { isSuperAdmin } from '@/lib/auth/super-admin';
import { getServiceRoleClient } from '@/lib/supabaseAdmin';
import { normalizeFeatures } from '@/lib/features';

export async function GET(req: Request) {
  const user = await getAuthUserFromRequest(req);
  if (!isSuperAdmin(user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let service;
  try {
    service = getServiceRoleClient();
  } catch (error) {
    console.error('[admin/users] missing service role', error);
    return NextResponse.json({ error: 'Supabase service role is not configured.' }, { status: 500 });
  }

  try {
    const { data, error } = await service.auth.admin.listUsers({ perPage: 1000 });
    if (error) {
      throw error;
    }

    const userIds = (data?.users ?? []).map((u) => u.id);
    const { data: settingsRows, error: settingsError } = await service
      .from('profile_settings')
      .select('user_id, features')
      .in('user_id', userIds);

    if (settingsError) {
      console.error('[admin/users] failed to load settings', settingsError);
    }

    const featureMap = new Map<string, string[] | null>();
    (settingsRows ?? []).forEach((row) => {
      featureMap.set(row.user_id, (row.features as string[]) ?? null);
    });

    const users = (data?.users ?? []).map((item) => ({
      id: item.id,
      email: item.email,
      features: normalizeFeatures({ features: featureMap.get(item.id) ?? undefined }),
      created_at: item.created_at,
    }));

    return NextResponse.json({ users });
  } catch (error) {
    console.error('[admin/users] unexpected error', error);
    return NextResponse.json({ error: 'Unable to load users.' }, { status: 500 });
  }
}

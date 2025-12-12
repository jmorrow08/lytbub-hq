import { NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/auth/client-auth';
import { isSuperAdmin } from '@/lib/auth/super-admin';
import { getServiceRoleClient } from '@/lib/supabaseAdmin';
import { normalizeFeatures } from '@/lib/features';

type RouteContext = {
  params: Promise<{ userId: string }>;
};

export async function GET(req: Request, context: RouteContext) {
  const { userId } = await context.params;
  const currentUser = await getAuthUserFromRequest(req);
  if (!isSuperAdmin(currentUser)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let service;
  try {
    service = getServiceRoleClient();
  } catch (error) {
    console.error('[admin/users/features/get] missing service role', error);
    return NextResponse.json({ error: 'Supabase service role is not configured.' }, { status: 500 });
  }

  const { data, error } = await service
    .from('profile_settings')
    .select('features')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[admin/users/features/get] fetch failed', error);
    return NextResponse.json({ error: 'Unable to load features.' }, { status: 500 });
  }

  return NextResponse.json({ features: normalizeFeatures(data) });
}

export async function POST(req: Request, context: RouteContext) {
  const { userId } = await context.params;
  const currentUser = await getAuthUserFromRequest(req);
  if (!isSuperAdmin(currentUser)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let desired: string[] = [];
  try {
    const body = (await req.json()) as { features?: string[] };
    desired = Array.isArray(body.features) ? body.features.filter(Boolean) : [];
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  let service;
  try {
    service = getServiceRoleClient();
  } catch (error) {
    console.error('[admin/users/features] missing service role', error);
    return NextResponse.json({ error: 'Supabase service role is not configured.' }, { status: 500 });
  }

  const { data: existing, error: fetchError } = await service
    .from('profile_settings')
    .select('user_id, timezone, app_mode, tz_last_seen_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchError) {
    console.error('[admin/users/features] fetch existing failed', fetchError);
  }

  const payload = {
    user_id: userId,
    timezone: existing?.timezone ?? 'America/New_York',
    app_mode: existing?.app_mode ?? 'LYTBUB_HQ',
    tz_last_seen_at: existing?.tz_last_seen_at ?? new Date().toISOString(),
    features: desired,
  };

  const { error: upsertError } = await service.from('profile_settings').upsert(payload, {
    onConflict: 'user_id',
  });

  if (upsertError) {
    console.error('[admin/users/features] upsert failed', upsertError);
    return NextResponse.json({ error: 'Unable to update features.' }, { status: 500 });
  }

  return NextResponse.json({ features: normalizeFeatures({ features: desired }) });
}

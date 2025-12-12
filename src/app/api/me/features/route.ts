import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUserFromRequest } from '@/lib/auth/client-auth';
import { ALL_FEATURE_FLAGS, normalizeFeatures, type FeatureFlag } from '@/lib/features';
import { isSuperAdmin } from '@/lib/auth/super-admin';

export async function GET(req: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 });
  }

  const user = await getAuthUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const authHeader = req.headers.get('authorization') ?? undefined;
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: authHeader ? { headers: { Authorization: authHeader } } : undefined,
  });

  const { data, error } = await supabase
    .from('profile_settings')
    .select('features')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    console.error('[me/features] failed to load profile settings', error);
  }

  const features = normalizeFeatures(data);
  if (isSuperAdmin(user)) {
    const allAccess = new Set<FeatureFlag>([...features, ...ALL_FEATURE_FLAGS]);
    return NextResponse.json({ features: Array.from(allAccess) });
  }

  return NextResponse.json({ features });
}

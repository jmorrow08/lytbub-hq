import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { createClient } from '@supabase/supabase-js';

type RouteContext = {
  params: Promise<{ clientId: string }>;
};

export async function GET(req: Request, context: RouteContext) {
  const { clientId } = await context.params;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 });
  }

  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .eq('created_by', user.id)
    .maybeSingle();

  if (clientError) {
    console.error('[api/admin/clients/:id/users] client lookup failed', clientError);
    return NextResponse.json({ error: 'Unable to load client.' }, { status: 500 });
  }

  if (!client) {
    return NextResponse.json({ error: 'Client not found.' }, { status: 404 });
  }

  const { data: members, error: memberError } = await supabase
    .from('client_users')
    .select('id, client_id, user_id, email, role, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: true });

  if (memberError) {
    console.error('[api/admin/clients/:id/users] member fetch failed', memberError);
    return NextResponse.json({ error: 'Unable to load client users.' }, { status: 500 });
  }

  return NextResponse.json({ members: members ?? [] });
}

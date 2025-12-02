import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type RouteParams = {
  params: { clientId: string; membershipId: string };
};

type Database = Record<string, unknown>;

async function getSupabaseClient(
  req: Request,
): Promise<{ supabase: SupabaseClient<Database>; userId: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase is not configured.');
  }

  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    throw new Error('Unauthorized');
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error('Unauthorized');
  }

  return { supabase, userId: user.id };
}

async function assertClientOwnership(
  supabase: SupabaseClient<Database>,
  clientId: string,
  userId: string,
) {
  const { data, error } = await supabase
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .eq('created_by', userId)
    .maybeSingle();

  if (error) {
    console.error('[api/admin/clients/:id/users/:memberId] client lookup failed', error);
    throw new Error('Unable to load client.');
  }

  if (!data) {
    const notFound = new Error('Client not found.');
    (notFound as { status?: number }).status = 404;
    throw notFound;
  }
}

async function loadMembership(
  supabase: SupabaseClient<Database>,
  clientId: string,
  membershipId: string,
) {
  const { data, error } = await supabase
    .from('client_users')
    .select('id, client_id, role')
    .eq('id', membershipId)
    .eq('client_id', clientId)
    .maybeSingle();

  if (error) {
    console.error('[api/admin/clients/:id/users/:memberId] membership lookup failed', error);
    throw new Error('Unable to load membership.');
  }

  if (!data) {
    const notFound = new Error('Membership not found.');
    (notFound as { status?: number }).status = 404;
    throw notFound;
  }

  if (data.role === 'owner') {
    const forbidden = new Error('Owner access cannot be modified.');
    (forbidden as { status?: number }).status = 400;
    throw forbidden;
  }

  return data;
}

export async function PATCH(req: Request, { params }: RouteParams) {
  try {
    const { supabase, userId } = await getSupabaseClient(req);
    await assertClientOwnership(supabase, params.clientId, userId);
    await loadMembership(supabase, params.clientId, params.membershipId);

    const body = (await req.json().catch(() => null)) as { role?: string } | null;
    if (!body || typeof body.role !== 'string') {
      return NextResponse.json({ error: 'role is required.' }, { status: 400 });
    }

    const role = body.role === 'admin' ? 'admin' : body.role === 'viewer' ? 'viewer' : null;
    if (!role) {
      return NextResponse.json({ error: 'role must be "viewer" or "admin".' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('client_users')
      .update({ role })
      .eq('id', params.membershipId)
      .eq('client_id', params.clientId)
      .select('id, client_id, user_id, email, role, created_at')
      .maybeSingle();

    if (error || !data) {
      console.error('[api/admin/clients/:id/users/:memberId] update failed', error);
      return NextResponse.json({ error: 'Unable to update member role.' }, { status: 500 });
    }

    return NextResponse.json({ member: data });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    const message =
      status === 401 || status === 404 ? (error as Error).message : 'Unable to update member.';
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(req: Request, { params }: RouteParams) {
  try {
    const { supabase, userId } = await getSupabaseClient(req);
    await assertClientOwnership(supabase, params.clientId, userId);
    await loadMembership(supabase, params.clientId, params.membershipId);

    const { error } = await supabase
      .from('client_users')
      .delete()
      .eq('id', params.membershipId)
      .eq('client_id', params.clientId);

    if (error) {
      console.error('[api/admin/clients/:id/users/:memberId] delete failed', error);
      return NextResponse.json({ error: 'Unable to remove member.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    const message =
      status === 401 || status === 404 ? (error as Error).message : 'Unable to remove member.';
    return NextResponse.json({ error: message }, { status });
  }
}

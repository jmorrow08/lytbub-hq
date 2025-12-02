import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function PATCH(req: Request, { params }: { params: { clientId: string } }) {
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

  let body: { portalEnabled?: unknown; notes?: unknown } | null = null;
  try {
    body = (await req.json()) as { portalEnabled?: unknown; notes?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body?.portalEnabled !== undefined) {
    updates.client_portal_enabled = Boolean(body.portalEnabled);
  }

  if (body?.notes !== undefined) {
    if (body.notes === null || typeof body.notes === 'string') {
      updates.client_portal_notes = body.notes;
    } else {
      return NextResponse.json({ error: 'notes must be a string or null.' }, { status: 400 });
    }
  }

  if (Object.keys(updates).length === 1) {
    return NextResponse.json({ error: 'No changes provided.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('clients')
    .update(updates)
    .eq('id', params.clientId)
    .eq('created_by', user.id)
    .select('*')
    .maybeSingle();

  if (error) {
    console.error('[api/admin/clients/:id/portal] update failed', error);
    return NextResponse.json(
      { error: 'Unable to update client portal settings.' },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json({ error: 'Client not found.' }, { status: 404 });
  }

  return NextResponse.json({ client: data });
}


import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { getAuthUserFromRequest, getClientPortalServiceClient } from '@/lib/auth/client-auth';

type ClientSignupBody = {
  shareId?: string | null;
  clientId?: string | null;
};

export async function POST(req: Request) {
  let user: User | null = null;
  try {
    user = await getAuthUserFromRequest(req);
  } catch (error) {
    console.error('[client-signup] Supabase configuration error', error);
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 });
  }

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: ClientSignupBody | null = null;
  try {
    body = (await req.json()) as ClientSignupBody;
  } catch (error) {
    console.error('[client-signup] Invalid JSON body', error);
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const shareId = body?.shareId?.trim() || null;
  const explicitClientId = body?.clientId?.trim() || null;

  if (!shareId && !explicitClientId) {
    return NextResponse.json({ error: 'Missing shareId or clientId.' }, { status: 400 });
  }

  let serviceClient;
  try {
    serviceClient = getClientPortalServiceClient();
  } catch (error) {
    console.error('[client-signup] Supabase configuration error', error);
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 });
  }

  let resolvedClientId = explicitClientId;

  if (!resolvedClientId && shareId) {
    const { data: invoice, error: invoiceError } = await serviceClient
      .from('invoices')
      .select('client_id, public_share_expires_at')
      .eq('public_share_id', shareId)
      .maybeSingle();

    if (invoiceError) {
      console.error('[client-signup] Failed to lookup invoice by shareId', {
        shareId,
        error: invoiceError,
      });
      return NextResponse.json({ error: 'Unable to resolve invoice.' }, { status: 500 });
    }

    if (!invoice) {
      return NextResponse.json({ error: 'Share link not found.' }, { status: 404 });
    }

    if (invoice.public_share_expires_at) {
      const expiry = new Date(invoice.public_share_expires_at);
      if (Number.isFinite(expiry.getTime()) && expiry.getTime() < Date.now()) {
        return NextResponse.json({ error: 'Share link has expired.' }, { status: 410 });
      }
    }

    resolvedClientId = invoice.client_id;
  }

  if (!resolvedClientId) {
    return NextResponse.json({ error: 'Unable to determine client.' }, { status: 400 });
  }

  const { data: client, error: clientError } = await serviceClient
    .from('clients')
    .select('id, created_by, client_portal_enabled')
    .eq('id', resolvedClientId)
    .maybeSingle();

  if (clientError) {
    console.error('[client-signup] Failed to fetch client', {
      clientId: resolvedClientId,
      error: clientError,
    });
    return NextResponse.json({ error: 'Unable to load client.' }, { status: 500 });
  }

  if (!client) {
    return NextResponse.json({ error: 'Client not found.' }, { status: 404 });
  }

  if (client.client_portal_enabled === false) {
    return NextResponse.json({ error: 'Client portal access is disabled.' }, { status: 403 });
  }

  const email = user.email?.toLowerCase().trim();
  if (!email) {
    return NextResponse.json(
      { error: 'Your account is missing an email address.' },
      { status: 400 },
    );
  }

  const role = client.created_by === user.id ? 'admin' : 'viewer';

  const { error: upsertError } = await serviceClient.from('client_users').upsert(
    {
      client_id: client.id,
      user_id: user.id,
      email,
      role,
    },
    { onConflict: 'client_id,user_id' },
  );

  if (upsertError) {
    console.error('[client-signup] Failed to link client user', {
      clientId: client.id,
      userId: user.id,
      error: upsertError,
    });
    return NextResponse.json({ error: 'Unable to link account to client.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, clientId: client.id, role });
}

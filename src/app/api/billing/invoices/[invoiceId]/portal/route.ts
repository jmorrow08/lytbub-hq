import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { createClient } from '@supabase/supabase-js';

type RouteContext = {
  params: Promise<{ invoiceId: string }>;
};

const ensureSupabase = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase is not configured.');
  }
  return { supabaseUrl, supabaseAnonKey };
};

export async function PATCH(req: Request, context: RouteContext) {
  try {
    const { invoiceId } = await context.params;
    const { supabaseUrl, supabaseAnonKey } = ensureSupabase();

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

    const body = (await req.json().catch(() => null)) as {
      portalPayload?: Record<string, unknown>;
      regenerateShareId?: boolean;
      expiresAt?: string | null;
    } | null;

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};

    if (body.portalPayload && typeof body.portalPayload === 'object') {
      updates.portal_payload = body.portalPayload;
    }

    if (body.regenerateShareId) {
      updates.public_share_id = crypto.randomUUID();
      // If no explicit expiry provided while regenerating, clear any old expiry
      if (body.expiresAt === undefined) {
        updates.public_share_expires_at = null;
      }
    }

    if (body.expiresAt !== undefined) {
      if (body.expiresAt === null || body.expiresAt === '') {
        updates.public_share_expires_at = null;
      } else {
        const expiresDate = new Date(body.expiresAt);
        if (Number.isNaN(expiresDate.getTime())) {
          return NextResponse.json(
            { error: 'expiresAt must be a valid date string.' },
            { status: 400 },
          );
        }
        updates.public_share_expires_at = expiresDate.toISOString();
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No changes provided.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('invoices')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', invoiceId)
      .eq('created_by', user.id)
      .select('*, line_items:invoice_line_items(*)')
      .maybeSingle();

    if (error) {
      console.error('[api/billing/invoices/:id/portal] update failed', error);
      return NextResponse.json(
        { error: 'Unable to update invoice portal settings.' },
        { status: 500 },
      );
    }

    if (!data) {
      return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
    }

    return NextResponse.json({ invoice: data });
  } catch (error) {
    console.error('[api/billing/invoices/:id/portal] unexpected error', error);
    return NextResponse.json({ error: 'Unexpected server error.' }, { status: 500 });
  }
}

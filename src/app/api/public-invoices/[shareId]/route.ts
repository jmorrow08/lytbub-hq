import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { createClient } from '@supabase/supabase-js';

type RouteContext = { params: Promise<{ shareId: string }> };

export async function GET(_req: Request, context: RouteContext) {
  try {
    const { shareId } = await context.params;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json(
        {
          ok: false,
          reason: 'missing_env',
          details: { supabaseUrl: !!supabaseUrl, serviceKey: !!serviceKey },
        },
        { status: 500 },
      );
    }
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${serviceKey}` } },
    });

    const { data, error } = await supabase
      .from('invoices')
      .select(
        `
        id,
        invoice_number,
        public_share_id,
        public_share_expires_at,
        created_at,
        status
      `,
      )
      .eq('public_share_id', shareId)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { ok: false, reason: 'supabase_error', message: String(error.message) },
        { status: 500 },
      );
    }

    if (!data) {
      return NextResponse.json({ ok: false, reason: 'not_found' }, { status: 404 });
    }

    const nowIso = new Date().toISOString();
    const expired =
      data.public_share_expires_at &&
      new Date(data.public_share_expires_at).getTime() < new Date().getTime();

    return NextResponse.json({
      ok: !expired,
      expired,
      now: nowIso,
      invoice: {
        id: data.id,
        invoice_number: data.invoice_number,
        public_share_id: data.public_share_id,
        public_share_expires_at: data.public_share_expires_at,
        status: data.status,
        created_at: data.created_at,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, reason: 'unexpected', message: String(error) },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { fetchPublicInvoice } from '@/lib/invoice-portal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ shareId: string }>;
};

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const { shareId } = await params;
    const invoice = await fetchPublicInvoice(shareId);
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found or expired.' }, { status: 404 });
    }
    return NextResponse.json({ invoice });
  } catch (error) {
    console.error('[api/public-invoices] unexpected error', error);
    const message =
      error instanceof Error ? error.message : 'Unable to load invoice. Check server logs.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { createClient } from '@supabase/supabase-js';

type RouteContext = {
  params: Promise<{ periodId: string }>;
};

export async function DELETE(req: Request, context: RouteContext) {
  try {
    const { periodId } = await context.params;
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

    const { data: period, error: periodError } = await supabase
      .from('billing_periods')
      .select('id')
      .eq('id', periodId)
      .eq('created_by', user.id)
      .maybeSingle();

    if (periodError) {
      console.error('[api/billing/billing-periods/:id] lookup failed', periodError);
      return NextResponse.json({ error: 'Unable to load billing period.' }, { status: 500 });
    }

    if (!period) {
      return NextResponse.json({ error: 'Billing period not found.' }, { status: 404 });
    }

    const { data: usageEvents, error: usageError } = await supabase
      .from('usage_events')
      .select('id')
      .eq('billing_period_id', periodId)
      .eq('created_by', user.id);

    if (usageError) {
      console.error('[api/billing/billing-periods/:id] usage lookup failed', usageError);
      return NextResponse.json({ error: 'Unable to inspect usage for period.' }, { status: 500 });
    }

    const usageIds = (usageEvents ?? []).map((row) => row.id);

    if (usageIds.length > 0) {
      const { error: pendingDeleteError } = await supabase
        .from('pending_invoice_items')
        .delete()
        .eq('created_by', user.id)
        .eq('source_type', 'usage')
        .in('source_ref_id', usageIds);

      if (pendingDeleteError) {
        console.error(
          '[api/billing/billing-periods/:id] pending items delete failed',
          pendingDeleteError,
        );
        return NextResponse.json(
          { error: 'Unable to delete pending items for period.' },
          { status: 500 },
        );
      }

      const { error: usageDeleteError } = await supabase
        .from('usage_events')
        .delete()
        .eq('created_by', user.id)
        .in('id', usageIds);

      if (usageDeleteError) {
        console.error(
          '[api/billing/billing-periods/:id] usage events delete failed',
          usageDeleteError,
        );
        return NextResponse.json(
          { error: 'Unable to delete usage events for period.' },
          { status: 500 },
        );
      }
    }

    const { error: periodDeleteError } = await supabase
      .from('billing_periods')
      .delete()
      .eq('id', periodId)
      .eq('created_by', user.id);

    if (periodDeleteError) {
      console.error('[api/billing/billing-periods/:id] delete failed', periodDeleteError);
      return NextResponse.json({ error: 'Unable to delete billing period.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[api/billing/billing-periods/:id] unexpected error', error);
    return NextResponse.json({ error: 'Unexpected server error.' }, { status: 500 });
  }
}


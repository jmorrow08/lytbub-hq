import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { createClient } from '@supabase/supabase-js';

type MarkPaidPayload = {
  amountCents?: number;
  notes?: string;
};

export async function POST(
  req: Request,
  { params }: { params: { invoiceId: string } }
) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 });
    }

    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
      return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
    }

    const payload = (await req.json().catch(() => ({}))) as MarkPaidPayload;

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

    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', params.invoiceId)
      .eq('created_by', user.id)
      .maybeSingle();

    if (invoiceError) {
      console.error('[api/billing/invoices/mark-paid-offline] invoice lookup failed', invoiceError);
      return NextResponse.json({ error: 'Unable to load invoice.' }, { status: 500 });
    }

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
    }

    const netAmount =
      typeof payload.amountCents === 'number' && payload.amountCents >= 0
        ? payload.amountCents
        : invoice.total_cents;

    const { data: updated, error: updateError } = await supabase
      .from('invoices')
      .update({
        status: 'paid',
        payment_method_type: 'offline',
        net_amount_cents: netAmount,
        metadata: {
          ...(invoice.metadata || {}),
          offline_notes: payload.notes,
          offline_marked_at: new Date().toISOString(),
        },
      })
      .eq('id', invoice.id)
      .select('*')
      .single();

    if (updateError || !updated) {
      console.error('[api/billing/invoices/mark-paid-offline] update failed', updateError);
      return NextResponse.json({ error: 'Unable to update invoice.' }, { status: 500 });
    }

    return NextResponse.json({ invoice: updated });
  } catch (error) {
    console.error('[api/billing/invoices/mark-paid-offline] unexpected error', error);
    return NextResponse.json({ error: 'Unexpected server error.' }, { status: 500 });
  }
}


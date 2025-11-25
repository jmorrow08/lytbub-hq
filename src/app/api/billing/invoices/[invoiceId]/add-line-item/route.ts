import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { createClient } from '@supabase/supabase-js';
import { addInvoiceLineItem } from '@/lib/stripe';

type AddLineItemPayload = {
  description: string;
  quantity?: number;
  unitPriceCents: number;
};

type InvoiceRouteContext = {
  params: Promise<{ invoiceId: string }>;
};

export async function POST(req: Request, context: InvoiceRouteContext) {
  try {
    const { invoiceId } = await context.params;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 });
    }

    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
      return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
    }

    const payload = (await req.json()) as AddLineItemPayload;
    if (!payload?.description || !Number.isFinite(Number(payload.unitPriceCents))) {
      return NextResponse.json(
        { error: 'description and unitPriceCents are required.' },
        { status: 400 },
      );
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

    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .eq('created_by', user.id)
      .maybeSingle();

    if (invoiceError) {
      console.error('[api/billing/invoices/add-line-item] invoice lookup failed', invoiceError);
      return NextResponse.json({ error: 'Unable to load invoice.' }, { status: 500 });
    }
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
    }
    if (invoice.status !== 'draft' || !invoice.stripe_invoice_id || !invoice.stripe_customer_id) {
      return NextResponse.json(
        { error: 'Only draft invoices with Stripe linkage can be edited.' },
        { status: 400 },
      );
    }

    await addInvoiceLineItem({
      customerId: invoice.stripe_customer_id,
      invoiceId: invoice.stripe_invoice_id,
      description: payload.description,
      amountCents: Math.round(Number(payload.unitPriceCents) || 0),
      quantity: Number(payload.quantity ?? 1),
      // Stripe metadata values must be strings
      metadata: { line_type: 'project', added_manually: 'true' },
    });

    const insertPayload: {
      invoice_id: string;
      line_type: 'project';
      description: string;
      quantity: number;
      unit_price_cents: number;
      amount_cents: number;
      sort_order: number;
      metadata: Record<string, unknown>;
      created_by: string;
    } = {
      invoice_id: invoice.id,
      line_type: 'project',
      description: payload.description,
      quantity: Number(payload.quantity ?? 1),
      unit_price_cents: Math.round(Number(payload.unitPriceCents) || 0),
      amount_cents: Math.round(Number(payload.quantity ?? 1) * Number(payload.unitPriceCents) || 0),
      sort_order: (invoice.line_items?.length ?? 0) + 100, // push to end
      metadata: { added_manually: true },
      created_by: user.id,
    };

    const { error: insertError } = await supabase.from('invoice_line_items').insert(insertPayload);

    if (insertError) {
      console.error(
        '[api/billing/invoices/add-line-item] failed to persist line item',
        insertError,
      );
    }

    // Return updated invoice with new line items
    const { data: updated, error: fetchError } = await supabase
      .from('invoices')
      .select('*, line_items:invoice_line_items(*)')
      .eq('id', invoice.id)
      .maybeSingle();

    if (fetchError || !updated) {
      return NextResponse.json(
        { error: 'Line item added, but invoice reload failed.' },
        { status: 500 },
      );
    }

    return NextResponse.json({ invoice: updated });
  } catch (error) {
    console.error('[api/billing/invoices/add-line-item] unexpected error', error);
    return NextResponse.json({ error: 'Unexpected server error.' }, { status: 500 });
  }
}

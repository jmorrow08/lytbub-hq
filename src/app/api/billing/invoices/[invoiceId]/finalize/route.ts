import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { createClient } from '@supabase/supabase-js';
import { finalizeAndSendInvoice } from '@/lib/stripe';

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
      console.error('[api/billing/invoices/finalize] invoice lookup failed', invoiceError);
      return NextResponse.json({ error: 'Unable to load invoice.' }, { status: 500 });
    }

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
    }

    if (!invoice.stripe_invoice_id) {
      return NextResponse.json({ error: 'Invoice is missing Stripe linkage.' }, { status: 400 });
    }

    const finalized = await finalizeAndSendInvoice(invoice.stripe_invoice_id, {
      sendImmediately: invoice.payment_method_type !== 'offline',
    });

    const { data: updated, error: updateError } = await supabase
      .from('invoices')
      .update({
        status: finalized.status || 'open',
        stripe_hosted_url: finalized.hosted_invoice_url,
        stripe_pdf_url: finalized.invoice_pdf,
        total_cents: finalized.amount_due ?? invoice.total_cents,
        tax_cents: finalized.total_tax_amounts?.reduce((sum, tax) => sum + (tax.amount || 0), 0) || invoice.tax_cents,
        net_amount_cents: finalized.amount_paid ?? invoice.net_amount_cents,
      })
      .eq('id', invoice.id)
      .select('*')
      .single();

    if (updateError || !updated) {
      console.error('[api/billing/invoices/finalize] update failed', updateError);
      return NextResponse.json({ error: 'Unable to update invoice.' }, { status: 500 });
    }

    return NextResponse.json({ invoice: updated, stripe: finalized });
  } catch (error) {
    console.error('[api/billing/invoices/finalize] unexpected error', error);
    return NextResponse.json({ error: 'Unexpected server error.' }, { status: 500 });
  }
}


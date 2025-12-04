import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const STRIPE_API_VERSION: Stripe.LatestApiVersion = '2024-06-20';

type InvoiceRouteContext = {
  params: Promise<{ invoiceId: string }>;
};

export async function DELETE(req: Request, context: InvoiceRouteContext) {
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
      console.error('[api/billing/invoices/delete] invoice lookup failed', invoiceError);
      return NextResponse.json({ error: 'Unable to load invoice.' }, { status: 500 });
    }
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
    }

    // If the invoice exists in Stripe, attempt to delete the draft there.
    // Stripe may refuse deletion for finalized/paid invoices; that is OK –
    // we still proceed with deleting local billing history.
    const stripeSecret = process.env.STRIPE_SECRET_KEY;
    if (stripeSecret && invoice.stripe_invoice_id) {
      const stripe = new Stripe(stripeSecret, { apiVersion: STRIPE_API_VERSION });
      try {
        await stripe.invoices.del(invoice.stripe_invoice_id);
      } catch (stripeError) {
        console.warn(
          '[api/billing/invoices/delete] Unable to delete Stripe draft invoice',
          stripeError,
        );
      }
    }

    const { error: deleteError } = await supabase.from('invoices').delete().eq('id', invoice.id);
    if (deleteError) {
      console.error('[api/billing/invoices/delete] delete failed', deleteError);
      return NextResponse.json({ error: 'Unable to delete invoice.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[api/billing/invoices/delete] unexpected error', error);
    return NextResponse.json({ error: 'Unexpected server error.' }, { status: 500 });
  }
}










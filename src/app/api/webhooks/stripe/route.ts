import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import Stripe from 'stripe';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const STRIPE_API_VERSION: Stripe.LatestApiVersion = '2024-06-20';
type SupabaseAdminClient = SupabaseClient<any>;

export async function POST(req: Request) {
  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!stripeSecret || !webhookSecret) {
    console.error('[stripe webhook] missing Stripe credentials');
    return NextResponse.json({ error: 'Stripe is not configured.' }, { status: 500 });
  }

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[stripe webhook] missing Supabase service credentials');
    return NextResponse.json({ error: 'Supabase service role is not configured.' }, { status: 500 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing Stripe signature.' }, { status: 400 });
  }

  const stripe = new Stripe(stripeSecret, { apiVersion: STRIPE_API_VERSION });
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    console.error('[stripe webhook] signature validation failed', error);
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }

  const supabaseAdmin: SupabaseAdminClient = createClient<any>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${serviceRoleKey}` } },
  });

  try {
    switch (event.type) {
      case 'invoice.paid':
        await handleInvoicePaid(event.data.object as Stripe.Invoice, stripe, supabaseAdmin);
        break;
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice, supabaseAdmin);
        break;
      default:
        // ignore unhandled events
        break;
    }
  } catch (error) {
    console.error('[stripe webhook] handler error', event.type, error);
    return NextResponse.json({ error: 'Webhook handler failed.' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handleInvoicePaid(
  invoice: Stripe.Invoice,
  stripe: Stripe,
  supabaseAdmin: SupabaseAdminClient
): Promise<void> {
  const stripeInvoiceId = invoice.id;
  let processingFeeCents = 0;
  let netAmountCents = invoice.amount_paid ?? invoice.amount_due ?? 0;

  if (typeof invoice.charge === 'string' && invoice.charge) {
    try {
      const charge = await stripe.charges.retrieve(invoice.charge, {
        expand: ['balance_transaction'],
      });
      const balanceTransaction = charge.balance_transaction as Stripe.BalanceTransaction | null;
      if (balanceTransaction) {
        processingFeeCents = balanceTransaction.fee ?? 0;
        netAmountCents = balanceTransaction.net ?? netAmountCents;
      }
    } catch (error) {
      console.warn('[stripe webhook] unable to load balance transaction', error);
    }
  }

  const taxCents =
    invoice.total_tax_amounts?.reduce((sum, tax) => sum + (tax.amount ?? 0), 0) ?? 0;

  const { error } = await supabaseAdmin
    .from('invoices')
    .update({
      status: 'paid',
      subtotal_cents: invoice.subtotal ?? invoice.amount_paid ?? 0,
      tax_cents: taxCents,
      processing_fee_cents: processingFeeCents,
      total_cents: invoice.amount_paid ?? invoice.amount_due ?? 0,
      net_amount_cents: netAmountCents,
      stripe_hosted_url: invoice.hosted_invoice_url,
      stripe_pdf_url: invoice.invoice_pdf,
      metadata: {
        ...invoice.metadata,
        stripe_event_id: invoice.id,
        paid_at: new Date().toISOString(),
      },
    })
    .eq('stripe_invoice_id', stripeInvoiceId);

  if (error) {
    const detail = error.message || JSON.stringify(error);
    throw new Error(`[stripe webhook] Failed to update paid invoice ${stripeInvoiceId}: ${detail}`);
  }
}

async function handleInvoicePaymentFailed(
  invoice: Stripe.Invoice,
  supabaseAdmin: SupabaseAdminClient
): Promise<void> {
  const attempt = invoice.attempt_count ?? 0;
  const { error } = await supabaseAdmin
    .from('invoices')
    .update({
      status: 'open',
      metadata: {
        ...invoice.metadata,
        last_failed_attempt: new Date().toISOString(),
        attempt_count: attempt,
      },
    })
    .eq('stripe_invoice_id', invoice.id);

  if (error) {
    const detail = error.message || JSON.stringify(error);
    throw new Error(`[stripe webhook] Failed to update failed invoice ${invoice.id}: ${detail}`);
  }
}


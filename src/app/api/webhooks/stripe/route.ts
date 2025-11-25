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
    return NextResponse.json(
      { error: 'Supabase service role is not configured.' },
      { status: 500 },
    );
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

  let ok = true;
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        ok =
          (await handleCheckoutCompleted(
            event.data.object as Stripe.Checkout.Session,
            stripe,
            supabaseAdmin,
          )) && ok;
        break;
      case 'invoice.paid':
        ok =
          (await handleInvoicePaid(event.data.object as Stripe.Invoice, stripe, supabaseAdmin)) &&
          ok;
        break;
      case 'invoice.payment_failed':
        ok =
          (await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice, supabaseAdmin)) &&
          ok;
        break;
      default:
        // ignore unhandled events
        break;
    }
  } catch (error) {
    // Per Stripe best practices, ACK the event even if downstream handling fails,
    // to avoid infinite retries. We log for observability.
    console.error('[stripe webhook] handler error (acknowledged)', event.type, error);
    return NextResponse.json({ received: true, ok: false, error: 'handler_exception' });
  }

  return NextResponse.json({ received: true, ok });
}

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  stripe: Stripe,
  supabaseAdmin: SupabaseAdminClient,
): Promise<boolean> {
  let summary: PaymentMethodSummary = EMPTY_PAYMENT_METHOD_SUMMARY;

  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id;

  if (paymentIntentId) {
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
        expand: ['payment_method', 'latest_charge'],
      });
      summary = summarizePaymentIntent(paymentIntent);
    } catch (error) {
      console.warn('[stripe webhook] unable to inspect payment intent', paymentIntentId, error);
    }
  }

  const { error } = await supabaseAdmin
    .from('payments')
    .update({
      status: 'paid',
      payment_method_used: summary.method,
      payment_brand: summary.brand,
      payment_last4: summary.last4,
    })
    .eq('stripe_id', session.id);

  if (error) {
    console.error('[stripe webhook] failed to update payment after checkout completion', {
      sessionId: session.id,
      error,
    });
    return false;
  }
  return true;
}

async function handleInvoicePaid(
  invoice: Stripe.Invoice,
  stripe: Stripe,
  supabaseAdmin: SupabaseAdminClient,
): Promise<boolean> {
  const stripeInvoiceId = invoice.id;
  let processingFeeCents = 0;
  let netAmountCents = invoice.amount_paid ?? invoice.amount_due ?? 0;
  let paymentSummary: PaymentMethodSummary = EMPTY_PAYMENT_METHOD_SUMMARY;

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
      paymentSummary = summarizeCharge(charge);
    } catch (error) {
      console.warn('[stripe webhook] unable to load balance transaction', error);
    }
  }

  const taxCents = invoice.total_tax_amounts?.reduce((sum, tax) => sum + (tax.amount ?? 0), 0) ?? 0;

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
      payment_method_used: paymentSummary.method,
      payment_brand: paymentSummary.brand,
      payment_last4: paymentSummary.last4,
      metadata: {
        ...invoice.metadata,
        stripe_event_id: invoice.id,
        paid_at: new Date().toISOString(),
      },
    })
    .eq('stripe_invoice_id', stripeInvoiceId);

  if (error) {
    console.error('[stripe webhook] failed to update paid invoice', {
      stripeInvoiceId,
      error,
    });
    return false;
  }
  return true;
}

async function handleInvoicePaymentFailed(
  invoice: Stripe.Invoice,
  supabaseAdmin: SupabaseAdminClient,
): Promise<boolean> {
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
    console.error('[stripe webhook] failed to update failed invoice', {
      stripeInvoiceId: invoice.id,
      error,
    });
    return false;
  }
  return true;
}

type PaymentMethodSummary = {
  method: string | null;
  brand: string | null;
  last4: string | null;
};

const EMPTY_PAYMENT_METHOD_SUMMARY: PaymentMethodSummary = {
  method: null,
  brand: null,
  last4: null,
};

function summarizePaymentIntent(paymentIntent?: Stripe.PaymentIntent | null): PaymentMethodSummary {
  if (!paymentIntent) {
    return EMPTY_PAYMENT_METHOD_SUMMARY;
  }

  if (paymentIntent.payment_method && typeof paymentIntent.payment_method !== 'string') {
    return summarizePaymentMethodObject(paymentIntent.payment_method as Stripe.PaymentMethod);
  }

  if (paymentIntent.latest_charge && typeof paymentIntent.latest_charge !== 'string') {
    return summarizeCharge(paymentIntent.latest_charge as Stripe.Charge);
  }

  if (paymentIntent.charges?.data?.length) {
    return summarizeCharge(paymentIntent.charges.data[0]);
  }

  return EMPTY_PAYMENT_METHOD_SUMMARY;
}

function summarizePaymentMethodObject(method?: Stripe.PaymentMethod | null): PaymentMethodSummary {
  if (!method) {
    return EMPTY_PAYMENT_METHOD_SUMMARY;
  }

  switch (method.type) {
    case 'card':
      return {
        method: 'card',
        brand: method.card?.brand ?? null,
        last4: method.card?.last4 ?? null,
      };
    case 'us_bank_account':
      return {
        method: 'us_bank_account',
        brand: method.us_bank_account?.bank_name ?? null,
        last4: method.us_bank_account?.last4 ?? null,
      };
    case 'link':
      return { method: 'link', brand: 'Link', last4: null };
    default:
      return { method: method.type ?? null, brand: null, last4: null };
  }
}

function summarizeCharge(charge?: Stripe.Charge | null): PaymentMethodSummary {
  if (!charge) {
    return EMPTY_PAYMENT_METHOD_SUMMARY;
  }
  return summarizeChargeDetails(charge.payment_method_details);
}

function summarizeChargeDetails(
  details?: Stripe.Charge.PaymentMethodDetails | null,
): PaymentMethodSummary {
  if (!details || !details.type) {
    return EMPTY_PAYMENT_METHOD_SUMMARY;
  }

  const type = details.type as string;
  switch (type) {
    case 'card':
      return {
        method: 'card',
        brand: details.card?.brand ?? null,
        last4: details.card?.last4 ?? null,
      };
    case 'us_bank_account':
      return {
        method: 'us_bank_account',
        brand: details.us_bank_account?.bank_name ?? null,
        last4: details.us_bank_account?.last4 ?? null,
      };
    case 'link':
      return { method: 'link', brand: 'Link', last4: null };
    case 'klarna':
      return { method: 'klarna', brand: 'Klarna', last4: null };
    default:
      return { method: type, brand: null, last4: null };
  }
}

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
      case 'invoice.finalized':
        ok =
          (await handleInvoiceFinalized(
            event.data.object as Stripe.Invoice,
            stripe,
            supabaseAdmin,
          )) && ok;
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
  const ensured = await upsertInvoiceRecord(invoice, supabaseAdmin);
  if (!ensured) {
    console.warn('[stripe webhook] unable to upsert invoice before marking paid', invoice.id);
  }

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

  const metadataPayload: Record<string, unknown> = {
    ...(invoice.metadata ?? {}),
    stripe_event_id: invoice.id,
    paid_at: new Date().toISOString(),
    auto_created_from_stripe: true,
  };

  const { data: updated, error } = await supabaseAdmin
    .from('invoices')
    .update({
      status: invoice.status || 'paid',
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
      metadata: metadataPayload,
    })
    .eq('stripe_invoice_id', stripeInvoiceId)
    .select('id')
    .maybeSingle();

  if (error || !updated) {
    console.error('[stripe webhook] failed to update paid invoice', {
      stripeInvoiceId,
      error,
    });
    return false;
  }
  return true;
}

async function handleInvoiceFinalized(
  invoice: Stripe.Invoice,
  _stripe: Stripe,
  supabaseAdmin: SupabaseAdminClient,
): Promise<boolean> {
  return upsertInvoiceRecord(invoice, supabaseAdmin);
}

async function handleInvoicePaymentFailed(
  invoice: Stripe.Invoice,
  supabaseAdmin: SupabaseAdminClient,
): Promise<boolean> {
  const ensured = await upsertInvoiceRecord(invoice, supabaseAdmin);
  if (!ensured) {
    console.warn('[stripe webhook] unable to upsert invoice before marking failed', invoice.id);
  }

  const attempt = invoice.attempt_count ?? 0;
  const metadataPayload: Record<string, unknown> = {
    ...(invoice.metadata ?? {}),
    last_failed_attempt: new Date().toISOString(),
    attempt_count: attempt,
    auto_created_from_stripe: true,
  };

  const { data: updated, error } = await supabaseAdmin
    .from('invoices')
    .update({
      status: 'open',
      metadata: metadataPayload,
    })
    .eq('stripe_invoice_id', invoice.id)
    .select('id')
    .maybeSingle();

  if (error || !updated) {
    console.error('[stripe webhook] failed to update failed invoice', {
      stripeInvoiceId: invoice.id,
      error,
    });
    return false;
  }
  return true;
}

type ProjectRecord = {
  id: string;
  client_id: string | null;
  created_by: string;
  base_retainer_cents: number | null;
  payment_method_type: string | null;
  auto_pay_enabled: boolean | null;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  name?: string | null;
};

async function upsertInvoiceRecord(
  invoice: Stripe.Invoice,
  supabaseAdmin: SupabaseAdminClient,
): Promise<boolean> {
  const context = await resolveProjectContext(invoice, supabaseAdmin);
  if (!context.project) {
    console.warn('[stripe webhook] unable to resolve project for invoice', invoice.id, context);
    return false;
  }

  const ownerId =
    context.project.created_by ||
    getMetadataString(invoice.metadata, 'created_by', 'owner_id', 'user_id');
  if (!ownerId) {
    console.warn('[stripe webhook] missing owner for invoice insert', invoice.id);
    return false;
  }

  const invoiceNumber = invoice.number || invoice.id;
  const subtotalCents = invoice.subtotal ?? invoice.amount_due ?? 0;
  const totalCents = invoice.total ?? invoice.amount_due ?? subtotalCents;
  const taxCents = invoice.total_tax_amounts?.reduce((sum, tax) => sum + (tax.amount ?? 0), 0) ?? 0;
  const dueDateYmd =
    typeof invoice.due_date === 'number'
      ? new Date(invoice.due_date * 1000).toISOString().slice(0, 10)
      : null;
  const createdAtIso =
    typeof invoice.created === 'number'
      ? new Date(invoice.created * 1000).toISOString()
      : new Date().toISOString();
  const stripeCustomerId =
    typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id ?? null;
  const stripeSubscriptionId =
    typeof invoice.subscription === 'string'
      ? invoice.subscription
      : invoice.subscription?.id ?? null;
  const paymentMethodType =
    context.project.payment_method_type ||
    (invoice.collection_method === 'send_invoice' ? 'offline' : 'card');

  const metadataPayload: Record<string, unknown> = {
    ...(invoice.metadata ?? {}),
    auto_created_from_stripe: true,
  };
  if (invoice.billing_reason) {
    metadataPayload.billing_reason = invoice.billing_reason;
  }
  if (context.billingPeriodId) {
    metadataPayload.billing_period_id = context.billingPeriodId;
  }
  if (context.clientId) {
    metadataPayload.client_id = context.clientId;
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('invoices')
    .select('id')
    .eq('stripe_invoice_id', invoice.id)
    .maybeSingle();

  if (existingError) {
    console.error('[stripe webhook] failed to lookup existing invoice', {
      invoiceId: invoice.id,
      error: existingError,
    });
    return false;
  }

  if (existing) {
    const { error: updateError } = await supabaseAdmin
      .from('invoices')
      .update({
        invoice_number: invoiceNumber,
        project_id: context.project.id,
        client_id: context.clientId ?? context.project.client_id,
        billing_period_id: context.billingPeriodId,
        subtotal_cents: subtotalCents,
        tax_cents: taxCents,
        total_cents: totalCents,
        net_amount_cents: invoice.amount_paid ?? totalCents,
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
        stripe_hosted_url: invoice.hosted_invoice_url,
        stripe_pdf_url: invoice.invoice_pdf,
        payment_method_type: paymentMethodType,
        collection_method: invoice.collection_method ?? 'charge_automatically',
        due_date: dueDateYmd,
        status: invoice.status ?? 'draft',
        metadata: metadataPayload,
      })
      .eq('id', existing.id);

    if (updateError) {
      console.error('[stripe webhook] failed to update invoice record', {
        invoiceId: invoice.id,
        error: updateError,
      });
      return false;
    }

    return true;
  }

  const insertPayload = {
    invoice_number: invoiceNumber,
    project_id: context.project.id,
    client_id: context.clientId ?? context.project.client_id,
    billing_period_id: context.billingPeriodId,
    stripe_invoice_id: invoice.id,
    stripe_customer_id: stripeCustomerId,
    stripe_subscription_id: stripeSubscriptionId,
    subtotal_cents: subtotalCents,
    tax_cents: taxCents,
    processing_fee_cents: 0,
    total_cents: totalCents,
    net_amount_cents: invoice.amount_paid ?? 0,
    payment_method_type: paymentMethodType,
    collection_method: invoice.collection_method ?? 'charge_automatically',
    due_date: dueDateYmd,
    status: invoice.status ?? 'draft',
    stripe_hosted_url: invoice.hosted_invoice_url,
    stripe_pdf_url: invoice.invoice_pdf,
    metadata: metadataPayload,
    created_by: ownerId,
    created_at: createdAtIso,
  };

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('invoices')
    .insert(insertPayload)
    .select('id')
    .single();

  if (insertError || !inserted) {
    console.error('[stripe webhook] failed to insert invoice record', {
      invoiceId: invoice.id,
      error: insertError,
    });
    return false;
  }

  const lineItems = Array.isArray(invoice.lines?.data) ? invoice.lines.data : [];
  if (lineItems.length > 0) {
    const linePayloads = lineItems.map((line, index) => {
      const amountCents = line.amount ?? 0;
      const quantity = line.quantity ?? 1;
      return {
        invoice_id: inserted.id,
        line_type: inferLineType(line),
        description:
          line.description ||
          line.price?.nickname ||
          (line.price?.product ? String(line.price.product) : undefined) ||
          'Line item',
        quantity,
        unit_price_cents: determineUnitAmountCents(line, amountCents, quantity),
        amount_cents: amountCents,
        sort_order: index,
        metadata: line.metadata ?? null,
        created_by: ownerId,
      };
    });

    const { error: lineError } = await supabaseAdmin
      .from('invoice_line_items')
      .insert(linePayloads);

    if (lineError) {
      console.error('[stripe webhook] failed to insert invoice line items', {
        invoiceId: invoice.id,
        error: lineError,
      });
    }
  }

  return true;
}

async function resolveProjectContext(
  invoice: Stripe.Invoice,
  supabaseAdmin: SupabaseAdminClient,
): Promise<{
  project: ProjectRecord | null;
  clientId: string | null;
  billingPeriodId: string | null;
}> {
  const metadata = invoice.metadata ?? null;
  const projectIdFromMetadata = getMetadataString(metadata, 'project_id', 'projectId');
  const clientIdFromMetadata = getMetadataString(metadata, 'client_id', 'clientId');
  const billingPeriodId = getMetadataString(metadata, 'billing_period_id', 'billingPeriodId');
  const projectSelect =
    'id, client_id, created_by, base_retainer_cents, payment_method_type, auto_pay_enabled, stripe_subscription_id, stripe_customer_id, name';

  let project: ProjectRecord | null = null;

  if (projectIdFromMetadata) {
    const { data, error } = await supabaseAdmin
      .from('projects')
      .select(projectSelect)
      .eq('id', projectIdFromMetadata)
      .maybeSingle();
    if (error) {
      console.error('[stripe webhook] failed to lookup project by id', {
        projectId: projectIdFromMetadata,
        error,
      });
    } else {
      project = (data as ProjectRecord | null) ?? null;
    }
  }

  if (!project && typeof invoice.subscription === 'string' && invoice.subscription) {
    const { data, error } = await supabaseAdmin
      .from('projects')
      .select(projectSelect)
      .eq('stripe_subscription_id', invoice.subscription)
      .maybeSingle();
    if (error) {
      console.error('[stripe webhook] failed to lookup project by subscription', {
        subscriptionId: invoice.subscription,
        error,
      });
    } else {
      project = (data as ProjectRecord | null) ?? null;
    }
  }

  if (!project && typeof invoice.customer === 'string' && invoice.customer) {
    const { data, error } = await supabaseAdmin
      .from('projects')
      .select(projectSelect)
      .eq('stripe_customer_id', invoice.customer)
      .maybeSingle();
    if (error) {
      console.error('[stripe webhook] failed to lookup project by customer', {
        customerId: invoice.customer,
        error,
      });
    } else {
      project = (data as ProjectRecord | null) ?? null;
    }
  }

  return {
    project,
    clientId: clientIdFromMetadata ?? project?.client_id ?? null,
    billingPeriodId,
  };
}

function determineUnitAmountCents(
  line: Stripe.InvoiceLineItem,
  amountCents: number,
  quantity: number,
): number {
  if (typeof line.unit_amount_excluding_tax === 'number') {
    return Math.round(line.unit_amount_excluding_tax);
  }
  if (typeof line.price?.unit_amount === 'number') {
    return line.price.unit_amount;
  }
  if (quantity > 0) {
    return Math.round(amountCents / quantity);
  }
  return amountCents;
}

function inferLineType(line: Stripe.InvoiceLineItem): string {
  if (line.metadata?.line_type) {
    return line.metadata.line_type;
  }
  if (line.type === 'subscription') {
    return 'subscription';
  }
  if (line.price?.recurring) {
    return 'subscription';
  }
  if (line.type === 'invoiceitem') {
    return 'invoice_item';
  }
  return 'project';
}

function getMetadataString(
  metadata: Stripe.Metadata | null | undefined,
  ...keys: string[]
): string | null {
  if (!metadata) return null;
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
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

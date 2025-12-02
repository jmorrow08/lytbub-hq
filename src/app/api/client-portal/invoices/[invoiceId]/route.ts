import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { authorizeClientRequest, getClientPortalServiceClient } from '@/lib/auth/client-auth';

const STRIPE_API_VERSION: Stripe.LatestApiVersion = '2024-06-20';

export async function GET(req: Request, { params }: { params: { invoiceId: string } }) {
  const invoiceId = params.invoiceId;
  if (!invoiceId) {
    return NextResponse.json({ error: 'Invoice ID is required.' }, { status: 400 });
  }

  let serviceClient;
  try {
    serviceClient = getClientPortalServiceClient();
  } catch (error) {
    console.error('[client-portal invoice detail] Supabase configuration error', error);
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 });
  }

  const { data: invoice, error } = await serviceClient
    .from('invoices')
    .select(
      `id, client_id, invoice_number, status, due_date, created_at, total_cents, subtotal_cents, tax_cents, net_amount_cents, stripe_invoice_id, stripe_hosted_url, stripe_pdf_url, public_share_id, public_share_expires_at, portal_payload, metadata, line_items:invoice_line_items(*), project:projects(name)`,
    )
    .eq('id', invoiceId)
    .maybeSingle();

  if (error) {
    console.error('[client-portal invoice detail] Failed to load invoice', error);
    return NextResponse.json({ error: 'Unable to load invoice.' }, { status: 500 });
  }

  if (!invoice) {
    return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
  }

  const payments: Array<{
    id: string;
    amountCents: number;
    status: string;
    processedAt: string | null;
    method: string | null;
    receiptUrl: string | null;
  }> = [];

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (stripeSecret && invoice.stripe_invoice_id) {
    try {
      const stripe = new Stripe(stripeSecret, { apiVersion: STRIPE_API_VERSION });
      const stripeInvoice = await stripe.invoices.retrieve(invoice.stripe_invoice_id, {
        expand: ['payment_intent.charges'],
      });

      let charges: Stripe.Charge[] = [];
      if (stripeInvoice.payment_intent) {
        if (typeof stripeInvoice.payment_intent === 'string') {
          const pi = await stripe.paymentIntents.retrieve(stripeInvoice.payment_intent, {
            expand: ['charges'],
          });
          charges = (pi.charges as Stripe.ApiList<Stripe.Charge>)?.data ?? [];
        } else {
          const existingCharges = (
            stripeInvoice.payment_intent.charges as Stripe.ApiList<Stripe.Charge>
          )?.data;
          const pi =
            existingCharges && existingCharges.length > 0
              ? stripeInvoice.payment_intent
              : await stripe.paymentIntents.retrieve(stripeInvoice.payment_intent.id, {
                  expand: ['charges'],
                });
          charges = (pi.charges as Stripe.ApiList<Stripe.Charge>)?.data ?? [];
        }
      } else if (stripeInvoice.charge) {
        if (typeof stripeInvoice.charge === 'string') {
          const charge = await stripe.charges.retrieve(stripeInvoice.charge);
          charges = charge ? [charge] : [];
        } else {
          charges = [stripeInvoice.charge];
        }
      }

      charges.forEach((charge) => {
        payments.push({
          id: charge.id,
          amountCents: charge.amount_captured ?? charge.amount ?? 0,
          status: charge.status,
          processedAt: charge.created ? new Date(charge.created * 1000).toISOString() : null,
          method:
            charge.payment_method_details?.card?.brand && charge.payment_method_details.card.last4
              ? `${charge.payment_method_details.card.brand.toUpperCase()} •••• ${
                  charge.payment_method_details.card.last4
                }`
              : charge.payment_method_details?.type ?? null,
          receiptUrl: charge.receipt_url ?? null,
        });
      });
    } catch (stripeError) {
      console.warn(
        '[client-portal invoice detail] unable to load Stripe payment history',
        stripeError,
      );
    }
  }

  try {
    await authorizeClientRequest(req, { clientId: invoice.client_id, requirePortalEnabled: true });
  } catch (authError) {
    const message = authError instanceof Error ? authError.message : 'Unauthorized';
    const statusCode = message === 'Unauthorized' ? 401 : 403;
    return NextResponse.json({ error: message }, { status: statusCode });
  }

  type LineItemRow = {
    id: string;
    description?: string | null;
    quantity?: number | null;
    unit_price_cents?: number | null;
    amount_cents?: number | null;
    line_type?: string | null;
    metadata?: Record<string, unknown> | null;
  };

  const lineItems = ((invoice.line_items ?? []) as LineItemRow[]).map((item) => {
    const quantity = Number(item.quantity ?? 1) || 1;
    const unitCents = Number(item.unit_price_cents ?? item.amount_cents ?? 0) || 0;
    const totalCents = Number(item.amount_cents ?? quantity * unitCents) || 0;
    return {
      id: item.id,
      description: item.description ?? item.line_type ?? 'Line item',
      quantity,
      unitPriceCents: unitCents,
      totalCents,
      category: item.line_type ?? null,
      metadata: item.metadata ?? null,
    };
  });

  return NextResponse.json({
    invoice: {
      id: invoice.id,
      invoiceNumber: invoice.invoice_number,
      status: invoice.status,
      createdAt: invoice.created_at,
      dueDate: invoice.due_date,
      subtotalCents: Number(invoice.subtotal_cents ?? invoice.total_cents ?? 0) || 0,
      taxCents: Number(invoice.tax_cents ?? 0) || 0,
      totalCents: Number(invoice.total_cents ?? 0) || 0,
      netAmountCents: Number(invoice.net_amount_cents ?? 0) || 0,
      amountDueCents: Math.max(
        0,
        (Number(invoice.total_cents ?? 0) || 0) - (Number(invoice.net_amount_cents ?? 0) || 0),
      ),
      hostedUrl: invoice.stripe_hosted_url ?? null,
      pdfUrl: invoice.stripe_pdf_url ?? null,
      publicShareId: invoice.public_share_id ?? null,
      publicShareExpiresAt: invoice.public_share_expires_at ?? null,
      portalPayload: invoice.portal_payload ?? {},
      metadata: invoice.metadata ?? {},
      projectName: Array.isArray(invoice.project)
        ? (invoice.project[0] as { name?: string | null })?.name ?? null
        : (invoice.project as { name?: string | null })?.name ?? null,
      lineItems,
      payments,
    },
  });
}



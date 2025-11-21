import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { createClient } from '@supabase/supabase-js';
import { addInvoiceLineItem, createDraftInvoice } from '@/lib/stripe';
import {
  applyPaymentMethodAdjustments,
  DraftLine,
  PaymentMethodType,
} from '@/lib/billing-calculator';

type DraftInvoicePayload = {
  billingPeriodId: string;
  includeProcessingFee?: boolean;
  memo?: string;
};

export async function POST(req: Request) {
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

    const payload = (await req.json()) as DraftInvoicePayload;
    if (!payload?.billingPeriodId) {
      return NextResponse.json({ error: 'billingPeriodId is required.' }, { status: 400 });
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
      .select('*')
      .eq('id', payload.billingPeriodId)
      .eq('created_by', user.id)
      .maybeSingle();

    if (periodError) {
      console.error('[api/billing/invoices/draft] billing period lookup failed', periodError);
      return NextResponse.json({ error: 'Unable to load billing period.' }, { status: 500 });
    }

    if (!period) {
      return NextResponse.json({ error: 'Billing period not found.' }, { status: 404 });
    }

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select(
        'id, name, subscription_enabled, base_retainer_cents, payment_method_type, stripe_customer_id, stripe_subscription_id, ach_discount_cents, auto_pay_enabled, client_id'
      )
      .eq('id', period.project_id)
      .eq('created_by', user.id)
      .maybeSingle();

    if (projectError) {
      console.error('[api/billing/invoices/draft] project lookup failed', projectError);
      return NextResponse.json({ error: 'Unable to load client record.' }, { status: 500 });
    }

    if (!project) {
      return NextResponse.json({ error: 'Client project not found.' }, { status: 404 });
    }

    if (!project.stripe_customer_id) {
      return NextResponse.json(
        { error: 'Client is missing a Stripe customer. Configure subscription first.' },
        { status: 400 }
      );
    }

    const clientId = period.client_id || project.client_id || null;
    if (!clientId) {
      return NextResponse.json({ error: 'Client is missing for this project.' }, { status: 400 });
    }

    const { data: usageEvents, error: usageError } = await supabase
      .from('usage_events')
      .select('id, metric_type, quantity, unit_price_cents, description')
      .eq('billing_period_id', period.id)
      .eq('project_id', project.id)
      .eq('created_by', user.id);

    if (usageError) {
      console.error('[api/billing/invoices/draft] usage fetch failed', usageError);
      return NextResponse.json({ error: 'Unable to load usage data.' }, { status: 500 });
    }

    const baseLines: DraftLine[] = [];

    if (project.subscription_enabled && Number(project.base_retainer_cents) > 0) {
      baseLines.push({
        lineType: 'base_subscription',
        description: `${project.name || 'Client'} Monthly Retainer`,
        quantity: 1,
        unitPriceCents: project.base_retainer_cents,
      });
    }

    if (usageEvents && usageEvents.length > 0) {
      const aggregation = new Map<
        string,
        { description: string; quantity: number; unit_price_cents: number }
      >();

      for (const event of usageEvents) {
        const unitPrice = Number(event.unit_price_cents) || 0;
        const key = `${event.metric_type || 'usage'}:${unitPrice}:${event.description || 'Usage'}`;
        if (!aggregation.has(key)) {
          aggregation.set(key, {
            description:
              event.description ||
              `${event.metric_type ? `${event.metric_type} usage` : 'Usage charge'}`,
            quantity: 0,
            unit_price_cents: unitPrice,
          });
        }
        const group = aggregation.get(key)!;
        group.quantity += Number(event.quantity) || 0;
      }

      for (const group of aggregation.values()) {
        baseLines.push({
          lineType: 'usage',
          description: group.description,
          quantity: group.quantity,
          unitPriceCents: group.unit_price_cents,
        });
      }
    }

    if (baseLines.length === 0) {
      return NextResponse.json(
        { error: 'No line items available for this billing period.' },
        { status: 400 }
      );
    }

    const paymentMethodType =
      (project.payment_method_type as PaymentMethodType | null) ?? 'card';

    const showProcessingFeeLine =
      payload.includeProcessingFee ?? paymentMethodType === 'card';

    const { lines: calculatedLines, subtotalCents, totalCents } =
      applyPaymentMethodAdjustments(baseLines, {
        paymentMethodType,
        autoPayEnabled: Boolean(project.auto_pay_enabled),
        achDiscountCents: project.ach_discount_cents ?? undefined,
        showProcessingFeeLine,
      });

    const description = `Services ${period.period_start} → ${period.period_end}`;

    const stripeInvoice = await createDraftInvoice({
      customerId: project.stripe_customer_id,
      subscriptionId: project.stripe_subscription_id || undefined,
      description,
      metadata: {
        billing_period_id: period.id,
        project_id: project.id,
      },
    });

    for (const line of calculatedLines) {
      await addInvoiceLineItem({
        customerId: project.stripe_customer_id,
        invoiceId: stripeInvoice.id,
        description: line.description,
        amountCents: line.unitPriceCents,
        quantity: line.quantity,
        metadata: {
          line_type: line.lineType,
          billing_period_id: period.id,
        },
      });
    }

    const invoiceNumber = generateInvoiceNumber(period.period_start);

    const { data: invoiceRecord, error: invoiceError } = await supabase
      .from('invoices')
      .insert({
        invoice_number: invoiceNumber,
        project_id: project.id,
        client_id: clientId,
        billing_period_id: period.id,
        stripe_invoice_id: stripeInvoice.id,
        stripe_customer_id: project.stripe_customer_id,
        stripe_subscription_id: project.stripe_subscription_id,
        subtotal_cents: subtotalCents,
        tax_cents: 0,
        processing_fee_cents: calculatedLines
          .filter((line) => line.lineType === 'processing_fee')
          .reduce((sum, line) => sum + line.amountCents, 0),
        total_cents: totalCents,
        net_amount_cents: totalCents,
        payment_method_type: paymentMethodType,
        status: 'draft',
        metadata: { memo: payload.memo },
        created_by: user.id,
      })
      .select('*')
      .single();

    if (invoiceError || !invoiceRecord) {
      console.error('[api/billing/invoices/draft] invoice insert failed', invoiceError);
      return NextResponse.json({ error: 'Failed to persist invoice.' }, { status: 500 });
    }

    const lineItemsPayload = calculatedLines.map((line, index) => ({
      invoice_id: invoiceRecord.id,
      line_type: line.lineType,
      description: line.description,
      quantity: line.quantity,
      unit_price_cents: line.unitPriceCents,
      amount_cents: line.amountCents,
      sort_order: index,
      metadata: line.metadata,
      created_by: user.id,
    }));

    const { error: lineInsertError } = await supabase
      .from('invoice_line_items')
      .insert(lineItemsPayload);

    if (lineInsertError) {
      console.error('[api/billing/invoices/draft] line item insert failed', lineInsertError);
      await supabase.from('invoices').delete().eq('id', invoiceRecord.id);
      return NextResponse.json({ error: 'Failed to persist invoice line items.' }, { status: 500 });
    }

    const { data: savedLineItems, error: fetchLineItemsError } = await supabase
      .from('invoice_line_items')
      .select('*')
      .eq('invoice_id', invoiceRecord.id)
      .order('sort_order', { ascending: true });

    if (fetchLineItemsError) {
      console.error('[api/billing/invoices/draft] unable to load line items', fetchLineItemsError);
      return NextResponse.json({ error: 'Invoice created, but line items missing.' }, { status: 500 });
    }

    return NextResponse.json({
      invoice: {
        ...invoiceRecord,
        line_items: savedLineItems,
        stripe_invoice_id: stripeInvoice.id,
      },
    });
  } catch (error) {
    console.error('[api/billing/invoices/draft] unexpected error', error);
    return NextResponse.json({ error: 'Unexpected server error.' }, { status: 500 });
  }
}

function generateInvoiceNumber(periodStart: string): string {
  const date = new Date(periodStart);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const randomSuffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `INV-${year}${month}-${randomSuffix}`;
}

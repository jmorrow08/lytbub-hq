'use server';

import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { createClient } from '@supabase/supabase-js';
import {
  applyPaymentMethodAdjustments,
  type DraftLine,
  type PaymentMethodType,
} from '@/lib/billing-calculator';
import { addInvoiceLineItem, createDraftInvoice, finalizeAndSendInvoice } from '@/lib/stripe';
import {
  generateInvoiceNumber,
  mapPendingToLineType,
  parseDueDate,
  toNumber,
} from '@/lib/billing/quickInvoiceUtils';

type QuickInvoicePayload = {
  projectId: string;
  pendingItemIds: string[];
  includeRetainer?: boolean;
  collectionMethod?: 'auto' | 'charge_automatically' | 'send_invoice';
  dueDate?: string;
  memo?: string;
  clientId?: string;
  finalize?: boolean;
};

type RouteContext = {
  params: Promise<Record<string, never>>;
};

const ensureSupabase = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase is not configured.');
  }
  return { supabaseUrl, supabaseAnonKey };
};

async function resolveUser(supabaseUrl: string, supabaseAnonKey: string, authHeader: string) {
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw Object.assign(new Error('Unauthorized'), { status: 401 });
  }

  return { supabase, user };
}

export async function POST(req: Request, _context: RouteContext) {
  let stripeInvoiceId: string | null = null;
  try {
    const { supabaseUrl, supabaseAnonKey } = ensureSupabase();
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
      return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
    }

    const payload = (await req.json().catch(() => null)) as QuickInvoicePayload | null;
    if (!payload || typeof payload !== 'object') {
      return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 });
    }

    const pendingItemIds = Array.isArray(payload.pendingItemIds)
      ? payload.pendingItemIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
      : [];

    if (!payload.projectId || typeof payload.projectId !== 'string') {
      return NextResponse.json({ error: 'projectId is required.' }, { status: 400 });
    }

    if (pendingItemIds.length === 0) {
      return NextResponse.json({ error: 'Select at least one pending item.' }, { status: 400 });
    }

    const includeRetainer = Boolean(payload.includeRetainer);
    const finalizeNow = payload.finalize !== false;

    const { supabase, user } = await resolveUser(supabaseUrl, supabaseAnonKey, authHeader);

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select(
        'id, name, client_id, base_retainer_cents, stripe_customer_id, stripe_subscription_id, auto_pay_enabled, payment_method_type, ach_discount_cents, billing_default_collection_method, billing_auto_finalize',
      )
      .eq('id', payload.projectId)
      .eq('created_by', user.id)
      .maybeSingle();

    if (projectError) {
      console.error('[api/billing/quick-invoice] project lookup failed', projectError);
      return NextResponse.json({ error: 'Unable to load project.' }, { status: 500 });
    }

    if (!project) {
      return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    }

    if (!project.stripe_customer_id) {
      return NextResponse.json(
        { error: 'Project is missing a Stripe customer. Configure billing first.' },
        { status: 400 },
      );
    }

    let clientId: string | null = payload.clientId ?? project.client_id ?? null;
    if (!clientId) {
      return NextResponse.json(
        { error: 'Project must be linked to a client before creating invoices.' },
        { status: 400 },
      );
    }

    if (payload.clientId && payload.clientId !== project.client_id) {
      const { data: client, error: clientError } = await supabase
        .from('clients')
        .select('id')
        .eq('id', payload.clientId)
        .eq('created_by', user.id)
        .maybeSingle();
      if (clientError) {
        console.error('[api/billing/quick-invoice] client lookup failed', clientError);
        return NextResponse.json({ error: 'Unable to verify client.' }, { status: 500 });
      }
      if (!client) {
        return NextResponse.json({ error: 'Client not found.' }, { status: 400 });
      }
      clientId = client.id;
    }

    const { data: pendingItems, error: pendingError } = await supabase
      .from('pending_invoice_items')
      .select('*')
      .in('id', pendingItemIds)
      .eq('created_by', user.id)
      .eq('status', 'pending');

    if (pendingError) {
      console.error('[api/billing/quick-invoice] pending lookup failed', pendingError);
      return NextResponse.json({ error: 'Unable to load pending items.' }, { status: 500 });
    }

    if (!pendingItems || pendingItems.length !== pendingItemIds.length) {
      return NextResponse.json(
        { error: 'One or more pending items were not found or already billed.' },
        { status: 400 },
      );
    }

    const invalidProjectItem = pendingItems.find((item) => item.project_id !== project.id);
    if (invalidProjectItem) {
      return NextResponse.json(
        { error: 'Pending items must belong to the selected project.' },
        { status: 400 },
      );
    }

    const defaultCollection = project.billing_default_collection_method ?? 'charge_automatically';
    let collectionMethod: 'charge_automatically' | 'send_invoice';
    if (
      payload.collectionMethod === 'charge_automatically' ||
      payload.collectionMethod === 'send_invoice'
    ) {
      collectionMethod = payload.collectionMethod;
    } else if (payload.collectionMethod === 'auto' || !payload.collectionMethod) {
      if (
        project.auto_pay_enabled &&
        project.payment_method_type !== 'offline' &&
        project.stripe_customer_id
      ) {
        collectionMethod = 'charge_automatically';
      } else {
        collectionMethod = 'send_invoice';
      }
    } else {
      collectionMethod = defaultCollection;
    }

    if (project.payment_method_type === 'offline' && collectionMethod === 'charge_automatically') {
      collectionMethod = 'send_invoice';
    }

    const { ymd: dueDateYmd, unix: dueDateUnix } =
      collectionMethod === 'send_invoice'
        ? parseDueDate(payload.dueDate)
        : { ymd: null, unix: null };

    const baseLines: DraftLine[] = [];
    if (includeRetainer) {
      const retainerCents = Number(project.base_retainer_cents) || 0;
      if (retainerCents > 0) {
        baseLines.push({
          lineType: 'base_subscription',
          description: `${project.name ?? 'Client'} Monthly Retainer`,
          quantity: 1,
          unitPriceCents: retainerCents,
          metadata: { source: 'retainer' },
        });
      }
    }

    pendingItems.forEach((item) => {
      const quantity = toNumber(item.quantity, 1);
      const unitPrice = Number(item.unit_price_cents) || 0;
      baseLines.push({
        lineType: mapPendingToLineType(item.source_type),
        description: item.description ?? 'Service line item',
        quantity: quantity > 0 ? quantity : 1,
        unitPriceCents: unitPrice,
        metadata: {
          pending_item_id: item.id,
          source_type: item.source_type ?? 'manual',
        },
      });
    });

    if (baseLines.length === 0) {
      return NextResponse.json({ error: 'No billable lines were generated.' }, { status: 400 });
    }

    let pricingMethod: PaymentMethodType =
      (project.payment_method_type as PaymentMethodType | null) ?? 'card';
    if (collectionMethod === 'send_invoice') {
      pricingMethod = 'offline';
    }

    const calculated = applyPaymentMethodAdjustments(baseLines, {
      paymentMethodType: pricingMethod,
      autoPayEnabled: Boolean(project.auto_pay_enabled),
      achDiscountCents: project.ach_discount_cents ?? undefined,
      showProcessingFeeLine: true,
    });

    const description = `Quick invoice for ${project.name ?? 'Client'} (${
      pendingItems.length
    } item${pendingItems.length === 1 ? '' : 's'})`;

    const stripeInvoice = await createDraftInvoice({
      customerId: project.stripe_customer_id,
      subscriptionId: includeRetainer ? project.stripe_subscription_id ?? undefined : undefined,
      collectionMethod,
      dueDate: dueDateUnix,
      description,
      metadata: {
        project_id: project.id,
        client_id: clientId,
        pending_item_ids: pendingItems.map((item) => item.id).join(','),
        include_retainer: includeRetainer ? 'true' : 'false',
        quick_invoice: 'true',
        memo: payload.memo ?? undefined,
      },
    });
    stripeInvoiceId = stripeInvoice.id;

    for (const line of calculated.lines) {
      const metadata: Record<string, string> = {
        line_type: line.lineType,
      };
      if (line.metadata?.pending_item_id) {
        metadata.pending_item_id = String(line.metadata.pending_item_id);
      }
      await addInvoiceLineItem({
        customerId: project.stripe_customer_id,
        invoiceId: stripeInvoice.id,
        description: line.description,
        amountCents: line.unitPriceCents,
        quantity: line.quantity,
        metadata,
      });
    }

    const invoiceNumber = generateInvoiceNumber();
    const processingFeeCents = calculated.lines
      .filter((line) => line.lineType === 'processing_fee')
      .reduce((sum, line) => sum + line.amountCents, 0);

    const { data: invoiceRecord, error: invoiceInsertError } = await supabase
      .from('invoices')
      .insert({
        invoice_number: invoiceNumber,
        project_id: project.id,
        client_id: clientId,
        stripe_invoice_id: stripeInvoice.id,
        stripe_customer_id: project.stripe_customer_id,
        stripe_subscription_id: includeRetainer ? project.stripe_subscription_id : null,
        subtotal_cents: calculated.subtotalCents,
        total_cents: calculated.totalCents,
        net_amount_cents: calculated.totalCents,
        processing_fee_cents: processingFeeCents,
        tax_cents: 0,
        payment_method_type: pricingMethod,
        collection_method: collectionMethod,
        due_date: dueDateYmd,
        status: 'draft',
        metadata: {
          memo: payload.memo,
          quick_invoice: true,
        },
        created_by: user.id,
      })
      .select('*')
      .single();

    if (invoiceInsertError || !invoiceRecord) {
      console.error('[api/billing/quick-invoice] invoice insert failed', invoiceInsertError);
      return NextResponse.json({ error: 'Failed to persist invoice.' }, { status: 500 });
    }

    const lineItemsPayload = calculated.lines.map((line, index) => ({
      invoice_id: invoiceRecord.id,
      line_type: line.lineType,
      description: line.description,
      quantity: line.quantity,
      unit_price_cents: line.unitPriceCents,
      amount_cents: line.amountCents,
      sort_order: index,
      metadata: line.metadata ?? null,
      pending_source_item_id: line.metadata?.pending_item_id ?? null,
      created_by: user.id,
    }));

    const { data: insertedLineItems, error: lineInsertError } = await supabase
      .from('invoice_line_items')
      .insert(lineItemsPayload)
      .select('*');

    if (lineInsertError || !insertedLineItems) {
      console.error('[api/billing/quick-invoice] line items insert failed', lineInsertError);
      return NextResponse.json({ error: 'Failed to persist invoice line items.' }, { status: 500 });
    }

    const nowIso = new Date().toISOString();
    const lineLookup = new Map<string, string>();
    insertedLineItems.forEach((line) => {
      if (line.pending_source_item_id) {
        lineLookup.set(line.pending_source_item_id, line.id);
      }
    });

    await Promise.all(
      pendingItems.map((item) =>
        supabase
          .from('pending_invoice_items')
          .update({
            status: 'billed',
            billed_invoice_id: invoiceRecord.id,
            billed_invoice_line_item_id: lineLookup.get(item.id) ?? null,
            updated_at: nowIso,
          })
          .eq('id', item.id)
          .eq('created_by', user.id),
      ),
    );

    let finalizedInvoice = stripeInvoice;
    let needsPaymentMethod = false;

    if (finalizeNow) {
      try {
        finalizedInvoice = await finalizeAndSendInvoice(stripeInvoice.id, {
          sendImmediately: collectionMethod === 'send_invoice',
        });
      } catch (finalizeError) {
        console.error('[api/billing/quick-invoice] finalize failed', finalizeError);
        needsPaymentMethod = collectionMethod === 'charge_automatically';
      }

      const { data: updatedRecord, error: updateError } = await supabase
        .from('invoices')
        .update({
          status: finalizedInvoice.status ?? 'open',
          stripe_hosted_url: finalizedInvoice.hosted_invoice_url,
          stripe_pdf_url: finalizedInvoice.invoice_pdf,
          total_cents: finalizedInvoice.amount_due ?? calculated.totalCents,
          net_amount_cents: finalizedInvoice.amount_paid ?? calculated.totalCents,
          updated_at: new Date().toISOString(),
        })
        .eq('id', invoiceRecord.id)
        .select('*, line_items:invoice_line_items(*)')
        .maybeSingle();

      if (updateError || !updatedRecord) {
        console.error(
          '[api/billing/quick-invoice] invoice update after finalize failed',
          updateError,
        );
      }

      if (collectionMethod === 'charge_automatically') {
        needsPaymentMethod =
          needsPaymentMethod ||
          Boolean(
            finalizedInvoice.collection_method === 'charge_automatically' &&
              finalizedInvoice.status !== 'paid' &&
              finalizedInvoice.amount_remaining &&
              finalizedInvoice.amount_remaining > 0,
          );
      }

      return NextResponse.json({
        invoice: updatedRecord ?? invoiceRecord,
        stripe: finalizedInvoice,
        pendingItemIds,
        needsPaymentMethod,
      });
    }

    const { data: hydratedInvoice, error: fetchError } = await supabase
      .from('invoices')
      .select('*, line_items:invoice_line_items(*)')
      .eq('id', invoiceRecord.id)
      .maybeSingle();

    if (fetchError || !hydratedInvoice) {
      console.error('[api/billing/quick-invoice] fetch invoice failed', fetchError);
      return NextResponse.json(
        { error: 'Invoice created, but failed to load details.' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      invoice: hydratedInvoice,
      stripe: finalizedInvoice,
      pendingItemIds,
      needsPaymentMethod: false,
    });
  } catch (error) {
    if (stripeInvoiceId && process.env.STRIPE_SECRET_KEY) {
      try {
        const Stripe = (await import('stripe')).default;
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
          apiVersion: '2024-06-20',
        });
        await stripe.invoices.del(stripeInvoiceId);
      } catch (cleanupError) {
        console.warn('[api/billing/quick-invoice] cleanup failed', cleanupError);
      }
    }
    const status = (error as { status?: number }).status ?? 500;
    if (status >= 500) {
      console.error('[api/billing/quick-invoice] unexpected error', error);
    }
    return NextResponse.json({ error: (error as Error).message }, { status });
  }
}

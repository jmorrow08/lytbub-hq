import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { createClient } from '@supabase/supabase-js';
import { addInvoiceLineItem, createDraftInvoice, createOrUpdateCustomer } from '@/lib/stripe';
import {
  applyPaymentMethodAdjustments,
  DraftLine,
  PaymentMethodType,
} from '@/lib/billing-calculator';
import {
  generateInvoiceNumber,
  mapPendingToLineType,
  toNumber,
} from '@/lib/billing/quickInvoiceUtils';
import {
  buildPortalUsageDetails,
  type PortalPayload,
  type PortalUsageAggregationInput,
} from '@/lib/invoice-portal';

const redactErrorTokens = (message: string): string => {
  const patterns: RegExp[] = [
    /\bsk_(?:live|test)_[A-Za-z0-9]+\b/gi,
    /\b(?:cus|sub|acct|pi|pm|card|price|prod|cs)_[A-Za-z0-9]+\b/gi,
  ];
  return patterns.reduce((acc, pattern) => acc.replace(pattern, '[redacted]'), message);
};

const toClientSafeError = (message: string): string => {
  if (!message) {
    return process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred. Please try again later.'
      : 'Unexpected server error.';
  }
  const scrubbed = redactErrorTokens(message);
  return process.env.NODE_ENV === 'production'
    ? 'An unexpected error occurred. Please try again later.'
    : scrubbed;
};

type DraftInvoicePayload = {
  billingPeriodId: string;
  includeProcessingFee?: boolean;
  includeRetainer?: boolean;
  memo?: string;
  manualLines?: Array<{
    description: string;
    quantity?: number;
    unitPriceCents: number;
  }>;
  collectionMethod?: 'charge_automatically' | 'send_invoice';
  dueDate?: string; // YYYY-MM-DD
  pendingItemIds?: string[];
};

export async function POST(req: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const hasStripeSecret = Boolean(process.env.STRIPE_SECRET_KEY);

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 });
    }

    if (!hasStripeSecret) {
      return NextResponse.json({ error: 'Stripe is not configured.' }, { status: 500 });
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
        'id, name, subscription_enabled, base_retainer_cents, payment_method_type, stripe_customer_id, stripe_subscription_id, ach_discount_cents, auto_pay_enabled, client_id',
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

    const clientId = period.client_id || project.client_id || null;
    if (!clientId) {
      return NextResponse.json({ error: 'Client is missing for this project.' }, { status: 400 });
    }

    const { data: clientRecord, error: clientError } = await supabase
      .from('clients')
      .select('id, stripe_customer_id, name, company_name, email, phone')
      .eq('id', clientId)
      .eq('created_by', user.id)
      .maybeSingle();

    if (clientError) {
      console.error('[api/billing/invoices/draft] client lookup failed', clientError);
      return NextResponse.json({ error: 'Unable to load client record.' }, { status: 500 });
    }

    if (!clientRecord) {
      return NextResponse.json({ error: 'Client not found.' }, { status: 404 });
    }

    if (!clientRecord.stripe_customer_id && project.stripe_customer_id) {
      await supabase
        .from('clients')
        .update({
          stripe_customer_id: project.stripe_customer_id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', clientRecord.id)
        .eq('created_by', user.id);
    }

    // Resolve a valid Stripe customer ID (auto-repair if the stored ID is from the wrong Stripe mode)
    let stripeCustomerId: string | null =
      clientRecord.stripe_customer_id || project.stripe_customer_id || null;
    try {
      const displayName =
        (clientRecord.name && clientRecord.name.trim().length > 0 ? clientRecord.name : null) ??
        (clientRecord.company_name && clientRecord.company_name.trim().length > 0
          ? clientRecord.company_name
          : null) ??
        undefined;

      // Try to update existing customer; if it doesn't exist in the current Stripe mode, create a new one
      if (stripeCustomerId) {
        try {
          const customer = await createOrUpdateCustomer({
            customerId: stripeCustomerId,
            email: clientRecord.email ?? undefined,
            name: displayName,
            phone: clientRecord.phone ?? undefined,
            metadata: { client_id: clientRecord.id, project_id: project.id },
          });
          stripeCustomerId = customer.id;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          const isMissing =
            /No such customer/i.test(msg) ||
            (/resource_missing/i.test(msg) && /customer/i.test(msg));
          if (isMissing) {
            const created = await createOrUpdateCustomer({
              email: clientRecord.email ?? undefined,
              name: displayName,
              phone: clientRecord.phone ?? undefined,
              metadata: { client_id: clientRecord.id, project_id: project.id },
            });
            stripeCustomerId = created.id;
          } else {
            console.error('[api/billing/invoices/draft] failed to sync Stripe customer', e);
            return NextResponse.json(
              { error: 'Unable to sync Stripe customer for this client.' },
              { status: 502 },
            );
          }
        }
      } else {
        const created = await createOrUpdateCustomer({
          email: clientRecord.email ?? undefined,
          name: displayName,
          phone: clientRecord.phone ?? undefined,
          metadata: { client_id: clientRecord.id, project_id: project.id },
        });
        stripeCustomerId = created.id;
      }

      // Persist back to the client if changed or previously missing
      if (
        !clientRecord.stripe_customer_id ||
        clientRecord.stripe_customer_id !== stripeCustomerId
      ) {
        await supabase
          .from('clients')
          .update({
            stripe_customer_id: stripeCustomerId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', clientRecord.id)
          .eq('created_by', user.id);
      }
      // Keep the project record in sync for legacy compatibility
      if (project.stripe_customer_id !== stripeCustomerId) {
        await supabase
          .from('projects')
          .update({
            stripe_customer_id: stripeCustomerId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', project.id)
          .eq('created_by', user.id);
      }
    } catch (syncError) {
      console.error('[api/billing/invoices/draft] unable to ensure Stripe customer', syncError);
      return NextResponse.json(
        { error: 'Unable to prepare Stripe customer for invoicing.' },
        { status: 502 },
      );
    }

    if (!stripeCustomerId) {
      return NextResponse.json(
        { error: 'Unable to resolve a Stripe customer for this client.' },
        { status: 502 },
      );
    }

    const pendingItemIds = Array.isArray(payload.pendingItemIds)
      ? payload.pendingItemIds
          .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
          .map((value) => value.trim())
      : [];

    type PendingItemRecord = {
      id: string;
      project_id: string;
      client_id: string | null;
      description: string | null;
      quantity: number | null;
      unit_price_cents: number;
      source_type: string | null;
      metadata: Record<string, unknown> | null;
    };

    const resolvePendingItemsForPeriod = async (): Promise<PendingItemRecord[]> => {
      // 1) Try to scope existing pending items that were tagged to this billing period (usage imports)
      const { data: scopedPending, error: scopedError } = await supabase
        .from('pending_invoice_items')
        .select(
          'id, project_id, client_id, description, quantity, unit_price_cents, source_type, metadata',
        )
        .eq('project_id', project.id)
        .eq('status', 'pending')
        .eq('created_by', user.id)
        .eq('metadata->>billing_period_id', period.id);

      if (scopedError) {
        console.error('[api/billing/invoices/draft] scoped pending lookup failed', scopedError);
      }

      if (scopedPending && scopedPending.length > 0) {
        return scopedPending;
      }

      // 2) If nothing is queued yet, fall back to usage events that belong to this billing period.
      const { data: usageAggregates, error: usageError } = await supabase
        .from('usage_events')
        .select('id, description, metric_type, quantity, unit_price_cents, metadata')
        .eq('billing_period_id', period.id)
        .eq('created_by', user.id)
        .eq('metadata->>aggregate', 'true');

      if (usageError) {
        console.error('[api/billing/invoices/draft] usage aggregate lookup failed', usageError);
        return [];
      }

      if (!usageAggregates || usageAggregates.length === 0) {
        return [];
      }

      const buildAmountCents = (metadata: Record<string, unknown>, unitPriceCents: number) => {
        const raw =
          typeof metadata.sum_cost_cents === 'number'
            ? metadata.sum_cost_cents
            : typeof metadata.total_cost_cents === 'number'
            ? metadata.total_cost_cents
            : unitPriceCents;
        return Math.max(0, Math.round(Number(raw) || 0));
      };

      const records = usageAggregates
        .map((event) => {
          const metadata = (event.metadata ?? {}) as Record<string, unknown>;
          const quantity = Number(event.quantity ?? metadata.total_rows ?? 1);
          const unitPriceCents = buildAmountCents(metadata, Number(event.unit_price_cents) || 0);
          if (!Number.isFinite(unitPriceCents) || unitPriceCents <= 0) {
            return null;
          }
          return {
            created_by: user.id,
            project_id: project.id,
            client_id: clientId,
            source_type: 'usage' as const,
            source_ref_id: event.id,
            description:
              event.description ||
              (typeof metadata.metric_type === 'string' ? metadata.metric_type : null) ||
              'Usage fees',
            quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
            unit_price_cents: unitPriceCents,
            metadata: { ...metadata, billing_period_id: period.id, usage_event_id: event.id },
          };
        })
        .filter((record): record is NonNullable<typeof record> => Boolean(record));

      if (records.length === 0) return [];

      const { data: inserted, error: insertError } = await supabase
        .from('pending_invoice_items')
        .insert(records)
        .select(
          'id, project_id, client_id, description, quantity, unit_price_cents, source_type, metadata',
        );

      if (insertError) {
        console.error(
          '[api/billing/invoices/draft] unable to queue usage as pending items',
          insertError,
        );
        return [];
      }

      return inserted ?? [];
    };

    let pendingItems: PendingItemRecord[] = [];

    if (pendingItemIds.length > 0) {
      const { data, error: pendingError } = await supabase
        .from('pending_invoice_items')
        .select(
          'id, project_id, client_id, description, quantity, unit_price_cents, source_type, metadata',
        )
        .in('id', pendingItemIds)
        .eq('created_by', user.id)
        .eq('status', 'pending');

      if (pendingError) {
        console.error('[api/billing/invoices/draft] pending lookup failed', pendingError);
        return NextResponse.json({ error: 'Unable to load pending items.' }, { status: 500 });
      }

      if (!data || data.length !== pendingItemIds.length) {
        return NextResponse.json(
          { error: 'One or more pending items are missing or already billed.' },
          { status: 400 },
        );
      }

      const invalidPending = data.find((item) => item.project_id !== project.id);
      if (invalidPending) {
        return NextResponse.json(
          { error: 'Pending items must belong to the billing period project.' },
          { status: 400 },
        );
      }

      pendingItems = data;
    } else {
      pendingItems = await resolvePendingItemsForPeriod();
    }

    const baseLines: DraftLine[] = [];
    const includeBaseRetainer =
      Boolean(payload.includeRetainer) && Number(project.base_retainer_cents) > 0;

    if (includeBaseRetainer) {
      baseLines.push({
        lineType: 'base_subscription',
        description: `${project.name || 'Client'} Monthly Retainer`,
        quantity: 1,
        unitPriceCents: project.base_retainer_cents,
        metadata: { source: 'retainer' },
      });
    }

    if (pendingItems.length > 0) {
      for (const item of pendingItems) {
        const quantity = toNumber(item.quantity, 1);
        const unitPrice = Number(item.unit_price_cents) || 0;
        baseLines.push({
          lineType: mapPendingToLineType(item.source_type),
          description: item.description || 'Service line item',
          quantity: quantity > 0 ? quantity : 1,
          unitPriceCents: unitPrice,
          metadata: {
            pending_item_id: item.id,
            source_type: item.source_type ?? 'manual',
          },
        });
      }
    }

    const normalizedManualLines: Array<{
      description: string;
      quantity: number;
      unitPriceCents: number;
    }> = [];

    if (Array.isArray(payload.manualLines)) {
      for (const line of payload.manualLines) {
        const qty = Number(line.quantity ?? 1);
        const unit = Math.round(Number(line.unitPriceCents) || 0);
        if (!line.description || !Number.isFinite(qty) || !Number.isFinite(unit)) continue;
        const sanitized = {
          description: line.description.trim(),
          quantity: qty,
          unitPriceCents: unit,
        };
        normalizedManualLines.push(sanitized);
        baseLines.push({
          lineType: 'project',
          description: sanitized.description,
          quantity: sanitized.quantity,
          unitPriceCents: sanitized.unitPriceCents,
          metadata: { manual_entry: 'true' },
        });
      }
    }

    if (baseLines.length === 0) {
      return NextResponse.json(
        { error: 'Select pending items, add manual lines, or include the retainer.' },
        { status: 400 },
      );
    }

    const paymentMethodType = (project.payment_method_type as PaymentMethodType | null) ?? 'card';

    const showProcessingFeeLine = payload.includeProcessingFee ?? paymentMethodType === 'card';

    const {
      lines: calculatedLines,
      subtotalCents,
      totalCents,
    } = applyPaymentMethodAdjustments(baseLines, {
      paymentMethodType,
      autoPayEnabled: Boolean(project.auto_pay_enabled),
      achDiscountCents: project.ach_discount_cents ?? undefined,
      showProcessingFeeLine,
    });

    const description = `Services ${period.period_start} → ${period.period_end}`;

    // Determine collection method and due date (for manual invoices)
    const collectionMethod: 'charge_automatically' | 'send_invoice' =
      payload.collectionMethod === 'send_invoice' ? 'send_invoice' : 'charge_automatically';
    // Enforce dueDate when sending an invoice (manual collection)
    let dueDateUnix: number | null = null;
    if (collectionMethod === 'send_invoice') {
      const raw = payload.dueDate;
      const isYmd = typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw);
      if (!isYmd) {
        return NextResponse.json(
          { error: 'dueDate (YYYY-MM-DD) is required when collectionMethod is "send_invoice".' },
          { status: 400 },
        );
      }
      // Parse YYYY-MM-DD in local time to avoid UTC shift
      const [yStr, mStr, dStr] = raw.split('-');
      const y = Number(yStr);
      const m = Number(mStr);
      const d = Number(dStr);
      const localDate = new Date(y, m - 1, d);
      if (
        !Number.isFinite(y) ||
        !Number.isFinite(m) ||
        !Number.isFinite(d) ||
        Number.isNaN(localDate.getTime())
      ) {
        return NextResponse.json(
          { error: 'dueDate is invalid. Expected format: YYYY-MM-DD.' },
          { status: 400 },
        );
      }
      dueDateUnix = Math.floor(localDate.getTime() / 1000);
    }

    const invoiceMetadata: Record<string, string> = {
      billing_period_id: period.id,
      project_id: project.id,
      include_retainer: includeBaseRetainer ? 'true' : 'false',
    };
    if (pendingItems.length > 0) {
      invoiceMetadata.pending_item_ids = pendingItems.map((item) => item.id).join(',');
    }
    if (payload.memo) {
      invoiceMetadata.memo = payload.memo;
    }

    let stripeInvoice;
    try {
      stripeInvoice = await createDraftInvoice({
        customerId: stripeCustomerId,
        subscriptionId: includeBaseRetainer
          ? project.stripe_subscription_id || undefined
          : undefined,
        collectionMethod,
        dueDate: dueDateUnix,
        description,
        metadata: invoiceMetadata,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const subMissing =
        /No such subscription/i.test(msg) ||
        (/resource_missing/i.test(msg) && /subscription/i.test(msg));
      if (includeBaseRetainer && subMissing) {
        // Retry without a subscription reference (handles test→live migration cases)
        stripeInvoice = await createDraftInvoice({
          customerId: stripeCustomerId,
          subscriptionId: undefined,
          collectionMethod,
          dueDate: dueDateUnix,
          description,
          metadata: invoiceMetadata,
        });
      } else {
        throw e;
      }
    }

    for (const line of calculatedLines) {
      const stripeMetadata: Record<string, string> = {
        line_type: line.lineType,
        billing_period_id: period.id,
      };
      if (line.metadata?.pending_item_id) {
        stripeMetadata.pending_item_id = String(line.metadata.pending_item_id);
      }
      if (line.metadata?.manual_entry) {
        stripeMetadata.manual_entry = 'true';
      }
      await addInvoiceLineItem({
        customerId: stripeCustomerId,
        invoiceId: stripeInvoice.id,
        description: line.description,
        amountCents: line.unitPriceCents,
        quantity: line.quantity,
        metadata: stripeMetadata,
      });
    }

    const invoiceNumber = generateInvoiceNumber(period.period_start);

    const invoiceMetadataDb: Record<string, unknown> = {
      pending_item_ids: pendingItems.map((item) => item.id),
      pending_item_count: pendingItems.length,
      manual_line_count: normalizedManualLines.length,
      include_retainer: includeBaseRetainer,
    };
    if (payload.memo) {
      invoiceMetadataDb.memo = payload.memo;
    }

    const { data: invoiceRecord, error: invoiceError } = await supabase
      .from('invoices')
      .insert({
        invoice_number: invoiceNumber,
        project_id: project.id,
        client_id: clientId,
        billing_period_id: period.id,
        stripe_invoice_id: stripeInvoice.id,
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: includeBaseRetainer ? project.stripe_subscription_id : null,
        subtotal_cents: subtotalCents,
        tax_cents: 0,
        processing_fee_cents: calculatedLines
          .filter((line) => line.lineType === 'processing_fee')
          .reduce((sum, line) => sum + line.amountCents, 0),
        total_cents: totalCents,
        net_amount_cents: totalCents,
        payment_method_type: paymentMethodType,
        collection_method: collectionMethod,
        due_date: collectionMethod === 'send_invoice' ? payload.dueDate || null : null,
        status: 'draft',
        metadata: invoiceMetadataDb,
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
      metadata: {
        ...(line.metadata ?? {}),
        billing_period_id: period.id,
      },
      pending_source_item_id: line.metadata?.pending_item_id ?? null,
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
      return NextResponse.json(
        { error: 'Invoice created, but line items missing.' },
        { status: 500 },
      );
    }

    let responsePortalPayload: PortalPayload | null = null;
    try {
      const usageInputs: PortalUsageAggregationInput[] = pendingItems
        .filter((item) => item.source_type === 'usage')
        .map((item) => {
          const metadata = item.metadata ?? {};
          const sumCost =
            Number(metadata.sum_cost_cents ?? metadata.total_cents ?? item.unit_price_cents) || 0;
          const metricType =
            typeof metadata.metric_type === 'string' ? metadata.metric_type : 'usage';
          return {
            metricType,
            quantity: Number(metadata.total_rows ?? item.quantity ?? 1) || 1,
            rawCostCents: sumCost,
            billedCents: sumCost,
            description: item.description ?? undefined,
          };
        });

      const usageDetails = buildPortalUsageDetails(usageInputs);
      if (usageDetails.length > 0) {
        responsePortalPayload = {
          usageDetails,
          periodLabel: `${period.period_start} → ${period.period_end}`,
        };
        const { error: payloadUpdateError } = await supabase
          .from('invoices')
          .update({ portal_payload: responsePortalPayload })
          .eq('id', invoiceRecord.id);
        if (payloadUpdateError) {
          console.warn(
            '[api/billing/invoices/draft] failed to set portal payload',
            payloadUpdateError,
          );
          responsePortalPayload = null;
        }
      }
    } catch (payloadError) {
      console.warn(
        '[api/billing/invoices/draft] unable to build usage detail payload',
        payloadError,
      );
    }

    if (pendingItems.length > 0 && savedLineItems) {
      const lineLookup = new Map<string, string>();
      for (const line of savedLineItems) {
        if (line.pending_source_item_id) {
          lineLookup.set(line.pending_source_item_id, line.id);
        }
      }
      const updatedAt = new Date().toISOString();
      await Promise.all(
        pendingItems.map((item) =>
          supabase
            .from('pending_invoice_items')
            .update({
              status: 'billed',
              billed_invoice_id: invoiceRecord.id,
              billed_invoice_line_item_id: lineLookup.get(item.id) ?? null,
              updated_at: updatedAt,
            })
            .eq('id', item.id)
            .eq('created_by', user.id),
        ),
      );
    }

    return NextResponse.json({
      invoice: {
        ...invoiceRecord,
        line_items: savedLineItems,
        stripe_invoice_id: stripeInvoice.id,
        portal_payload: responsePortalPayload ?? invoiceRecord.portal_payload ?? {},
      },
    });
  } catch (error) {
    const err = error as unknown;
    // Surface a more actionable message to the UI to aid diagnosis
    // (e.g., Stripe "resource_missing", invalid subscription, etc.)
    const message =
      err instanceof Error
        ? err.message
        : typeof err === 'string'
        ? err
        : (() => {
            try {
              return JSON.stringify(err);
            } catch {
              return 'Unexpected server error.';
            }
          })();
    // Prefer a specific status code if present on known error types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const status =
      (err as any)?.statusCode ||
      (err as any)?.status ||
      // Stripe errors expose `statusCode`; Supabase errors may expose `code` but we keep 500
      500;
    const responseMessage = toClientSafeError(message);
    console.error('[api/billing/invoices/draft] unexpected error', err);
    return NextResponse.json(
      { error: responseMessage },
      { status: Number.isInteger(status) ? status : 500 },
    );
  }
}

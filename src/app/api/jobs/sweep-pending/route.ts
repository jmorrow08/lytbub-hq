import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
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

type ProjectRecord = {
  id: string;
  name: string | null;
  created_by: string;
  client_id: string | null;
  base_retainer_cents: number | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  auto_pay_enabled: boolean | null;
  payment_method_type: 'card' | 'ach' | 'offline' | null;
  ach_discount_cents: number | null;
  billing_auto_finalize: boolean | null;
  billing_default_collection_method: 'charge_automatically' | 'send_invoice' | null;
};

type PendingItemRecord = {
  id: string;
  project_id: string;
  client_id: string | null;
  description: string | null;
  quantity: number | string | null;
  unit_price_cents: number;
  source_type: string | null;
  metadata: Record<string, unknown> | null;
  created_by: string;
  created_at: string;
};

const ensureAdminSupabase = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase service credentials are not configured.');
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${serviceRoleKey}` } },
  }) as SupabaseClient;
};

function assertCronSecret(req: Request) {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    throw Object.assign(new Error('CRON_SECRET is not configured.'), { status: 500 });
  }
  const headerSecret =
    req.headers.get('x-cron-secret') ?? req.headers.get('authorization')?.replace('Bearer ', '');
  if (!headerSecret || headerSecret !== expectedSecret) {
    throw Object.assign(new Error('Unauthorized'), { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    assertCronSecret(req);
    const supabase = ensureAdminSupabase();

    const today = new Date();
    const todayDay = today.getUTCDate();

    const { data: projects, error: projectError } = await supabase
      .from('projects')
      .select(
        'id, name, created_by, client_id, base_retainer_cents, stripe_customer_id, stripe_subscription_id, auto_pay_enabled, payment_method_type, ach_discount_cents, billing_auto_finalize, billing_default_collection_method, billing_anchor_day',
      )
      .eq('billing_anchor_day', todayDay)
      .not('billing_anchor_day', 'is', null);

    if (projectError) {
      console.error('[cron/sweep-pending] project lookup failed', projectError);
      return NextResponse.json({ error: 'Unable to load projects for sweep.' }, { status: 500 });
    }

    if (!projects || projects.length === 0) {
      return NextResponse.json({ processed: 0, created: 0, message: 'No projects scheduled.' });
    }

    const projectIds = projects.map((project) => project.id);
    const { data: pendingItems, error: pendingError } = await supabase
      .from('pending_invoice_items')
      .select('*')
      .in('project_id', projectIds)
      .eq('status', 'pending');

    if (pendingError) {
      console.error('[cron/sweep-pending] pending lookup failed', pendingError);
      return NextResponse.json({ error: 'Unable to load pending items.' }, { status: 500 });
    }

    const groupedPending = new Map<string, PendingItemRecord[]>();
    (pendingItems as PendingItemRecord[] | null)?.forEach((item) => {
      if (!groupedPending.has(item.project_id)) {
        groupedPending.set(item.project_id, []);
      }
      groupedPending.get(item.project_id)?.push(item);
    });

    const results: Array<Record<string, unknown>> = [];
    let createdCount = 0;

    for (const project of projects as Array<
      ProjectRecord & { billing_anchor_day: number | null }
    >) {
      const pending = groupedPending.get(project.id) ?? [];
      if (pending.length === 0) {
        results.push({
          projectId: project.id,
          skipped: true,
          reason: 'No pending items',
        });
        continue;
      }

      if (!project.client_id) {
        results.push({
          projectId: project.id,
          skipped: true,
          reason: 'Project missing client',
        });
        continue;
      }

      if (!project.stripe_customer_id) {
        results.push({
          projectId: project.id,
          skipped: true,
          reason: 'Project missing Stripe customer',
        });
        continue;
      }

      try {
        const includeRetainer = true;
        const collectionPreference =
          project.billing_default_collection_method ?? 'charge_automatically';

        let collectionMethod: 'charge_automatically' | 'send_invoice' = collectionPreference;
        if (collectionPreference === 'charge_automatically') {
          if (!project.auto_pay_enabled || project.payment_method_type === 'offline') {
            collectionMethod = 'send_invoice';
          }
        }

        if (collectionMethod === 'charge_automatically' && !project.auto_pay_enabled) {
          collectionMethod = 'send_invoice';
        }

        const baseLines: DraftLine[] = [];
        const retainerCents = Number(project.base_retainer_cents) || 0;
        if (includeRetainer && retainerCents > 0) {
          baseLines.push({
            lineType: 'base_subscription',
            description: `${project.name ?? 'Client'} Monthly Retainer`,
            quantity: 1,
            unitPriceCents: retainerCents,
            metadata: { source: 'retainer', auto_sweep: true },
          });
        }

        pending.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

        pending.forEach((item) => {
          const quantity = toNumber(item.quantity, 1);
          baseLines.push({
            lineType: mapPendingToLineType(item.source_type),
            description: item.description ?? 'Service line item',
            quantity: quantity > 0 ? quantity : 1,
            unitPriceCents: Number(item.unit_price_cents) || 0,
            metadata: {
              pending_item_id: item.id,
              source_type: item.source_type ?? 'manual',
              auto_sweep: true,
            },
          });
        });

        if (baseLines.length === 0) {
          results.push({
            projectId: project.id,
            skipped: true,
            reason: 'No billable lines',
          });
          continue;
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

        const description = `Monthly sweep for ${project.name ?? 'Client'} (${pending.length} item${
          pending.length === 1 ? '' : 's'
        })`;

        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 7);
        const { ymd: dueDateYmd, unix: dueDateUnix } =
          collectionMethod === 'send_invoice'
            ? parseDueDate(dueDate.toISOString().slice(0, 10))
            : { ymd: null, unix: null };

        const stripeInvoice = await createDraftInvoice({
          customerId: project.stripe_customer_id,
          subscriptionId: includeRetainer ? project.stripe_subscription_id ?? undefined : undefined,
          collectionMethod,
          dueDate: dueDateUnix,
          description,
          metadata: {
            project_id: project.id,
            client_id: project.client_id,
            pending_item_ids: pending.map((item) => item.id).join(','),
            include_retainer: includeRetainer ? 'true' : 'false',
            quick_invoice: 'true',
            auto_sweep: 'true',
          },
        });

        for (const line of calculated.lines) {
          const metadata: Record<string, string> = {
            line_type: line.lineType,
            auto_sweep: 'true',
          };
          if (line.metadata?.pending_item_id) {
            metadata.pending_item_id = String(line.metadata.pending_item_id);
          }
          await addInvoiceLineItem({
            customerId: project.stripe_customer_id!,
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
            client_id: project.client_id,
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
              quick_invoice: true,
              auto_sweep: true,
            },
            created_by: project.created_by,
          })
          .select('*')
          .single();

        if (invoiceInsertError || !invoiceRecord) {
          console.error('[cron/sweep-pending] invoice insert failed', invoiceInsertError);
          throw new Error('Failed to persist invoice record.');
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
          created_by: project.created_by,
        }));

        const { data: insertedLineItems, error: lineInsertError } = await supabase
          .from('invoice_line_items')
          .insert(lineItemsPayload)
          .select('*');

        if (lineInsertError || !insertedLineItems) {
          console.error('[cron/sweep-pending] line insert failed', lineInsertError);
          throw new Error('Failed to persist invoice lines.');
        }

        const nowIso = new Date().toISOString();
        const lineLookup = new Map<string, string>();
        insertedLineItems.forEach((line) => {
          if (line.pending_source_item_id) {
            lineLookup.set(line.pending_source_item_id, line.id);
          }
        });

        await Promise.all(
          pending.map((item) =>
            supabase
              .from('pending_invoice_items')
              .update({
                status: 'billed',
                billed_invoice_id: invoiceRecord.id,
                billed_invoice_line_item_id: lineLookup.get(item.id) ?? null,
                updated_at: nowIso,
              })
              .eq('id', item.id),
          ),
        );

        let finalizedInvoice = stripeInvoice;
        let finalizeStatus: 'finalized' | 'draft' = 'draft';

        if (project.billing_auto_finalize ?? true) {
          finalizedInvoice = await finalizeAndSendInvoice(stripeInvoice.id, {
            sendImmediately: collectionMethod === 'send_invoice',
          });

          const { error: updateError } = await supabase
            .from('invoices')
            .update({
              status: finalizedInvoice.status ?? 'open',
              stripe_hosted_url: finalizedInvoice.hosted_invoice_url,
              stripe_pdf_url: finalizedInvoice.invoice_pdf,
              total_cents: finalizedInvoice.amount_due ?? calculated.totalCents,
              net_amount_cents: finalizedInvoice.amount_paid ?? calculated.totalCents,
              updated_at: new Date().toISOString(),
            })
            .eq('id', invoiceRecord.id);

          if (updateError) {
            console.error('[cron/sweep-pending] invoice finalize update failed', updateError);
          }
          finalizeStatus = 'finalized';
        }

        createdCount += 1;
        results.push({
          projectId: project.id,
          invoiceId: invoiceRecord.id,
          pendingCount: pending.length,
          status: finalizeStatus,
        });
      } catch (projectError) {
        console.error('[cron/sweep-pending] project processing failed', {
          projectId: project.id,
          error: projectError,
        });
        results.push({
          projectId: project.id,
          error: (projectError as Error).message,
        });
      }
    }

    return NextResponse.json({
      processed: projects.length,
      created: createdCount,
      results,
    });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    if (status >= 500) {
      console.error('[cron/sweep-pending] unexpected error', error);
    }
    return NextResponse.json({ error: (error as Error).message }, { status });
  }
}

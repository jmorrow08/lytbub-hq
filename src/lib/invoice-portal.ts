/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@supabase/supabase-js';

// Use a generic database type for this server-only helper to avoid incorrect `never` inference
type Database = Record<string, unknown>;
type ServiceClient = ReturnType<typeof createClient<Database>>;

export type PortalUsageDetail = {
  id?: string;
  toolName: string;
  description?: string;
  rawCost?: number;
  markupPercent?: number;
  billedAmount?: number;
};

export type PortalUsageAggregationInput = {
  metricType: string;
  quantity?: number;
  unitPriceCents?: number;
  rawCostCents?: number;
  billedCents?: number;
  description?: string;
};

export function buildPortalUsageDetails(
  inputs: PortalUsageAggregationInput[],
): PortalUsageDetail[] {
  const map = new Map<
    string,
    {
      toolName: string;
      rawCostCents: number;
      billedCents: number;
      descriptions: string[];
    }
  >();

  inputs.forEach((input) => {
    const key = input.metricType || 'usage';
    const existing = map.get(key) ?? {
      toolName: key,
      rawCostCents: 0,
      billedCents: 0,
      descriptions: [],
    };

    const unitCents = Number(input.unitPriceCents ?? 0) || 0;
    const quantity = Number(input.quantity ?? 0) || 0;
    const computedRaw = Number.isFinite(unitCents * quantity) ? unitCents * quantity : 0;
    const rawCents = Number(input.rawCostCents ?? computedRaw) || 0;
    const billedCents = Number(input.billedCents ?? rawCents) || 0;

    existing.rawCostCents += rawCents;
    existing.billedCents += billedCents;
    if (input.description) {
      existing.descriptions.push(input.description);
    }
    map.set(key, existing);
  });

  const details: PortalUsageDetail[] = Array.from(map.values()).map((item) => {
    const rawCost = item.rawCostCents / 100;
    const billed = item.billedCents / 100;
    const markupPercent =
      rawCost > 0 ? Math.round(((billed - rawCost) / rawCost) * 100 * 10) / 10 : undefined;

    return {
      toolName: item.toolName,
      rawCost,
      billedAmount: billed,
      markupPercent,
      description: item.descriptions.join('; ').trim() || undefined,
    };
  });

  return details.sort((a, b) => (b.billedAmount ?? 0) - (a.billedAmount ?? 0));
}

export type PortalShadowItem = {
  id?: string;
  label: string;
  description: string;
  hours?: number;
  marketRatePerHour?: number;
  impliedValue?: number;
  isComplimentary?: boolean;
};

export type PortalShadowSummary = {
  totalImpliedValue?: number;
  complimentaryValue?: number;
  note?: string;
};

export type PortalPayload = {
  usageDetails?: PortalUsageDetail[];
  shadowItems?: PortalShadowItem[];
  shadowSummary?: PortalShadowSummary;
  aiNotes?: string;
  roadmapUpdates?: string[];
  voiceScript?: string;
  periodLabel?: string;
};

export type PortalInvoiceLine = {
  id: string;
  label: string;
  description?: string | null;
  quantity: number;
  unitAmountCents: number;
  totalAmountCents: number;
  category?: string | null;
};

export type PublicInvoiceView = {
  id: string;
  shareId: string;
  invoiceNumber: string | null;
  status: string;
  dueDate: string | null;
  createdAt: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  amountDueCents: number;
  hostedUrl: string | null;
  pdfUrl: string | null;
  currency: string;
  clientName: string;
  clientCompany: string | null;
  portalPayload: PortalPayload;
  lineItems: PortalInvoiceLine[];
};

function ensureServer(): void {
  if (typeof window !== 'undefined') {
    throw new Error('Public invoice helpers are server-only.');
  }
}

function getServiceClient(): ServiceClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase service role is not configured for invoice portal.');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${serviceRoleKey}` } },
  });
}

function parsePortalPayload(raw: unknown): PortalPayload {
  if (!raw || typeof raw !== 'object') return {};
  const payload = raw as Record<string, unknown>;

  const safeArray = <T>(value: unknown): T[] | undefined =>
    Array.isArray(value) ? (value as T[]) : undefined;

  const usageDetails = safeArray<PortalUsageDetail>(payload.usageDetails);
  const shadowItems = safeArray<PortalShadowItem>(payload.shadowItems);

  const shadowSummary =
    payload.shadowSummary && typeof payload.shadowSummary === 'object'
      ? (payload.shadowSummary as PortalShadowSummary)
      : undefined;

  return {
    usageDetails,
    shadowItems,
    shadowSummary,
    aiNotes: typeof payload.aiNotes === 'string' ? payload.aiNotes : undefined,
    roadmapUpdates: safeArray<string>(payload.roadmapUpdates)?.filter(
      (item) => typeof item === 'string' && item.trim().length > 0,
    ),
    voiceScript: typeof payload.voiceScript === 'string' ? payload.voiceScript : undefined,
    periodLabel: typeof payload.periodLabel === 'string' ? payload.periodLabel : undefined,
  };
}

export async function fetchPublicInvoice(shareId: string): Promise<PublicInvoiceView | null> {
  ensureServer();
  if (!shareId) return null;
  const supabase = getServiceClient();

  const result = await (supabase.from('invoices') as any)
    .select(
      `
      id,
      invoice_number,
      project_id,
      client_id,
      status,
      subtotal_cents,
      tax_cents,
      total_cents,
      net_amount_cents,
      collection_method,
      payment_method_type,
      due_date,
      created_at,
      stripe_hosted_url,
      stripe_pdf_url,
      metadata,
      portal_payload,
      public_share_id,
      public_share_expires_at,
      client:clients (name, company_name, contact_name, email),
      line_items:invoice_line_items (*)
    `,
    )
    .eq('public_share_id', shareId)
    .maybeSingle();
  const data =
    (result.data as {
      id: string;
      invoice_number?: string | null;
      project_id?: string | null;
      client_id?: string | null;
      status: string;
      subtotal_cents?: number | null;
      tax_cents?: number | null;
      total_cents?: number | null;
      net_amount_cents?: number | null;
      collection_method?: string | null;
      payment_method_type?: string | null;
      due_date?: string | null;
      created_at: string;
      stripe_hosted_url?: string | null;
      stripe_pdf_url?: string | null;
      metadata?: Record<string, unknown> | null;
      portal_payload?: unknown;
      public_share_id: string;
      public_share_expires_at?: string | null;
      client?:
        | { name?: string | null; company_name?: string | null; contact_name?: string | null }
        | Array<{
            name?: string | null;
            company_name?: string | null;
            contact_name?: string | null;
          }>
        | null;
      line_items?: unknown[] | null;
    } | null) ?? null;
  const error = result.error;

  if (error) {
    console.error('[fetchPublicInvoice] Supabase error', error);
    return null;
  }

  if (!data) return null;

  if (data.public_share_expires_at && new Date(data.public_share_expires_at) < new Date()) {
    return null;
  }

  const portalPayload = parsePortalPayload(data.portal_payload);

  type LineItemRow = {
    id?: string | number;
    quantity?: number | null;
    unit_price_cents?: number | null;
    amount_cents?: number | null;
    description?: string | null;
    line_type?: string | null;
    metadata?: Record<string, unknown> | null;
  };

  const lineItems: PortalInvoiceLine[] = ((data.line_items ?? []) as LineItemRow[]).map((line) => {
    const quantity = Number(line.quantity ?? 1) || 1;
    const unitCents = Number(line.unit_price_cents ?? line.amount_cents ?? 0) || 0;
    const amountCents = Number(line.amount_cents ?? Math.round(quantity * unitCents)) || 0;
    const metaRecord =
      line.metadata && typeof line.metadata === 'object'
        ? (line.metadata as Record<string, unknown>)
        : null;
    const metaMemo =
      metaRecord && typeof metaRecord.memo === 'string' ? metaRecord.memo : null;
    const metaNote = metaRecord && typeof metaRecord.note === 'string' ? metaRecord.note : null;
    const label =
      typeof line.description === 'string' && line.description.trim().length > 0
        ? line.description
        : line.line_type ?? 'Service line item';
    return {
      id: String(line.id ?? crypto.randomUUID()),
      label,
      description: metaMemo ?? metaNote ?? null,
      quantity,
      unitAmountCents: unitCents,
      totalAmountCents: amountCents,
      category: line.line_type ?? null,
    };
  });

  const totalCents = Number(data.total_cents ?? 0) || 0;
  const netAmountCents = Number(data.net_amount_cents ?? 0) || 0;
  const amountDueCents = Math.max(0, totalCents - netAmountCents) || totalCents;

  return {
    id: data.id,
    shareId,
    invoiceNumber: data.invoice_number ?? null,
    status: data.status,
    dueDate: data.due_date ?? null,
    createdAt: data.created_at,
    subtotalCents: Number(data.subtotal_cents ?? totalCents) || 0,
    taxCents: Number(data.tax_cents ?? 0) || 0,
    totalCents,
    amountDueCents,
    hostedUrl: data.stripe_hosted_url ?? null,
    pdfUrl: data.stripe_pdf_url ?? null,
    currency: 'USD',
    // `client` may be returned as an array by Supabase relation selects; take the first item if so
    clientName: (() => {
      const client = Array.isArray(data.client) ? data.client[0] : data.client;
      return client?.name ?? client?.company_name ?? client?.contact_name ?? 'Valued Client';
    })(),
    clientCompany: (() => {
      const client = Array.isArray(data.client) ? data.client[0] : data.client;
      return client?.company_name ?? client?.name ?? null;
    })(),
    portalPayload,
    lineItems,
  };
}

export function buildInvoiceSystemPrompt(invoice: PublicInvoiceView): string {
  const { portalPayload } = invoice;
  const usageSection =
    portalPayload.usageDetails && portalPayload.usageDetails.length
      ? portalPayload.usageDetails
          .map((u) => {
            const billed = typeof u.billedAmount === 'number' ? u.billedAmount.toFixed(2) : 'n/a';
            const raw = typeof u.rawCost === 'number' ? u.rawCost.toFixed(2) : 'n/a';
            const markup =
              typeof u.markupPercent === 'number'
                ? `${u.markupPercent}% markup`
                : 'no markup noted';
            return `- ${u.toolName}: billed $${billed} (raw ~$${raw}, ${markup})${
              u.description ? ` — ${u.description}` : ''
            }`;
          })
          .join('\n')
      : 'No usage details were provided.';

  const shadowSection =
    portalPayload.shadowItems && portalPayload.shadowItems.length
      ? portalPayload.shadowItems
          .map((s) => {
            const value =
              typeof s.impliedValue === 'number'
                ? `Value ~$${s.impliedValue.toLocaleString()}`
                : 'Value not stated';
            const hours =
              typeof s.hours === 'number' && typeof s.marketRatePerHour === 'number'
                ? `${s.hours} hrs @ $${s.marketRatePerHour.toFixed(2)}`
                : '';
            const complimentary = s.isComplimentary ? 'Included at no extra cost.' : '';
            return `- ${s.label}: ${value}. ${hours} ${complimentary} ${
              s.description ?? ''
            }`.trim();
          })
          .join('\n')
      : 'No shadow value items listed.';

  const shadowSummary = portalPayload.shadowSummary
    ? `Shadow summary: implied ~$${(
        portalPayload.shadowSummary.totalImpliedValue ?? 0
      ).toLocaleString()}, complimentary ~$${(
        portalPayload.shadowSummary.complimentaryValue ?? 0
      ).toLocaleString()}. Note: ${portalPayload.shadowSummary.note ?? 'n/a'}.`
    : 'Shadow summary not provided.';

  const notes = portalPayload.aiNotes ? `Notes: ${portalPayload.aiNotes}` : '';
  const roadmap =
    portalPayload.roadmapUpdates && portalPayload.roadmapUpdates.length
      ? `Upcoming: ${portalPayload.roadmapUpdates.join('; ')}`
      : '';

  return `
You are Lytbub, a calm, factual AI billing specialist. Explain the invoice clearly.
- Distinguish retainer vs usage vs shadow/value framing.
- Shadow items are NOT charges; they exist only to show market value.
- Keep replies under 200 words unless asked for deep detail.

Invoice:
- Client: ${invoice.clientName}${invoice.clientCompany ? ` (${invoice.clientCompany})` : ''}
- Invoice number: ${invoice.invoiceNumber ?? 'not set'}
- Status: ${invoice.status}
- Total: $${(invoice.totalCents / 100).toFixed(2)}
- Amount due: $${(invoice.amountDueCents / 100).toFixed(2)}
- Period: ${portalPayload.periodLabel ?? 'not specified'}

Line items:
${invoice.lineItems
  .map(
    (li) =>
      `- ${li.label}: $${(li.totalAmountCents / 100).toFixed(2)} (qty ${li.quantity}, $${(
        li.unitAmountCents / 100
      ).toFixed(2)} ea)`,
  )
  .join('\n')}

Usage:
${usageSection}

Shadow/value:
${shadowSection}
${shadowSummary}
${notes}
${roadmap}
`.trim();
}

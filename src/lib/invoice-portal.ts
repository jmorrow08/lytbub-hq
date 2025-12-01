import { createClient } from '@supabase/supabase-js';

// Use an untyped Supabase client for this server-only helper to avoid incorrect `never` inference
type ServiceClient = ReturnType<typeof createClient<any>>;

export type PortalUsageDetail = {
  id?: string;
  toolName: string;
  description?: string;
  rawCost?: number;
  markupPercent?: number;
  billedAmount?: number;
};

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

  const { data, error } = await supabase
    .from('invoices')
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

  if (error) {
    console.error('[fetchPublicInvoice] Supabase error', error);
    return null;
  }

  if (!data) return null;

  if (data.public_share_expires_at && new Date(data.public_share_expires_at) < new Date()) {
    return null;
  }

  const portalPayload = parsePortalPayload(data.portal_payload);

  const lineItems: PortalInvoiceLine[] = (data.line_items ?? []).map((line: any) => {
    const quantity = Number(line.quantity ?? 1) || 1;
    const unitCents = Number(line.unit_price_cents ?? line.amount_cents ?? 0) || 0;
    const amountCents = Number(line.amount_cents ?? Math.round(quantity * unitCents)) || 0;
    return {
      id: String(line.id ?? crypto.randomUUID()),
      label: line.description ?? line.line_type ?? 'Service line item',
      description: line.metadata?.memo ?? line.metadata?.note ?? null,
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

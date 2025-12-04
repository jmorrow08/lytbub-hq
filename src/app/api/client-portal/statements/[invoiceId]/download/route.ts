/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { authorizeClientRequest, getClientPortalServiceClient } from '@/lib/auth/client-auth';

function centsToCurrency(cents: number): string {
  return (cents / 100).toFixed(2);
}

type InvoiceForCsv = {
  id: string;
  invoice_number?: string | null;
  status?: string | null;
  created_at?: string | null;
  due_date?: string | null;
  subtotal_cents?: number | null;
  total_cents?: number | null;
  tax_cents?: number | null;
  portal_payload?: {
    usageDetails?: Array<{
      toolName?: string;
      billedAmount?: number;
      rawCost?: number;
      markupPercent?: number;
      description?: string;
    }>;
  } | null;
  line_items?: Array<{
    description?: string | null;
    quantity?: number | null;
    unit_price_cents?: number | null;
    amount_cents?: number | null;
    line_type?: string | null;
  }> | null;
};

function buildCsvContent(invoice: InvoiceForCsv) {
  const rows: string[][] = [];
  rows.push(['Invoice Number', invoice.invoice_number ?? invoice.id]);
  rows.push(['Status', invoice.status ?? 'unknown']);
  rows.push(['Issued', invoice.created_at ?? '']);
  rows.push(['Due Date', invoice.due_date ?? '']);
  rows.push([]);
  rows.push(['Line Item', 'Quantity', 'Unit Price (USD)', 'Total (USD)', 'Category']);

  for (const lineItem of invoice.line_items ?? []) {
    const quantity = Number(lineItem.quantity ?? 1) || 1;
    const unitCents = Number(lineItem.unit_price_cents ?? 0) || 0;
    const totalCents = Number(lineItem.amount_cents ?? quantity * unitCents) || 0;
    rows.push([
      lineItem.description ?? lineItem.line_type ?? 'Service',
      quantity.toString(),
      centsToCurrency(unitCents),
      centsToCurrency(totalCents),
      lineItem.line_type ?? '',
    ]);
  }

  rows.push([]);
  rows.push([
    'Subtotal',
    '',
    '',
    centsToCurrency(Number(invoice.subtotal_cents ?? invoice.total_cents ?? 0) || 0),
  ]);
  rows.push(['Tax', '', '', centsToCurrency(Number(invoice.tax_cents ?? 0) || 0)]);
  rows.push(['Total', '', '', centsToCurrency(Number(invoice.total_cents ?? 0) || 0)]);

  if (invoice.portal_payload?.usageDetails?.length) {
    rows.push([]);
    rows.push(['Usage Breakdown']);
    rows.push(['Tool', 'Billed Amount (USD)', 'Raw Cost (USD)', 'Markup (%)', 'Description']);
    for (const detail of invoice.portal_payload.usageDetails) {
      rows.push([
        detail.toolName ?? 'Usage',
        detail.billedAmount !== undefined
          ? centsToCurrency(Math.round(Number(detail.billedAmount) * 100))
          : '',
        detail.rawCost !== undefined
          ? centsToCurrency(Math.round(Number(detail.rawCost) * 100))
          : '',
        detail.markupPercent !== undefined ? String(detail.markupPercent) : '',
        detail.description ?? '',
      ]);
    }
  }

  return rows
    .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

type RouteContext = {
  params: Promise<{ invoiceId: string }>;
};

export async function GET(req: Request, context: RouteContext) {
  const type = new URL(req.url).searchParams.get('type') ?? 'pdf';
  const { invoiceId } = await context.params;
  const wantsJson = (req.headers.get('x-client-portal-download') ?? '').toLowerCase() === '1';

  if (!invoiceId) {
    return NextResponse.json({ error: 'Invoice ID is required.' }, { status: 400 });
  }

  let serviceClient;
  try {
    serviceClient = getClientPortalServiceClient();
  } catch (error) {
    console.error('[client-portal download] Supabase configuration error', error);
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 });
  }

  const invoiceResult = await (serviceClient.from('invoices') as any)
    .select(
      'id, client_id, invoice_number, status, due_date, created_at, total_cents, subtotal_cents, tax_cents, stripe_pdf_url, public_share_id, public_share_expires_at, portal_payload, line_items:invoice_line_items(*)',
    )
    .eq('id', invoiceId)
    .maybeSingle();
  const invoice = invoiceResult.data as InvoiceForCsv & {
    client_id: string;
    stripe_pdf_url: string | null;
    public_share_id: string | null;
    public_share_expires_at: string | null;
  } | null;
  const error = invoiceResult.error;

  if (error) {
    console.error('[client-portal download] Failed to load invoice', error);
    return NextResponse.json({ error: 'Unable to load invoice.' }, { status: 500 });
  }

  if (!invoice) {
    return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
  }

  try {
    await authorizeClientRequest(req, { clientId: invoice.client_id, requirePortalEnabled: true });
  } catch (authError) {
    const message = authError instanceof Error ? authError.message : 'Unauthorized';
    const statusCode = message === 'Unauthorized' ? 401 : 403;
    return NextResponse.json({ error: message }, { status: statusCode });
  }

  if (type === 'pdf') {
    const pdfUrl = invoice.stripe_pdf_url;
    if (pdfUrl) {
      if (wantsJson) {
        return NextResponse.json({ url: pdfUrl });
      }
      return NextResponse.redirect(pdfUrl);
    }
    return NextResponse.json({ error: 'PDF not available for this invoice.' }, { status: 404 });
  }

  if (type === 'csv') {
    const csv = buildCsvContent(invoice);
    const filename = `invoice-${invoice.invoice_number ?? invoice.id}.csv`;
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  }

  return NextResponse.json({ error: 'Unsupported download type.' }, { status: 400 });
}

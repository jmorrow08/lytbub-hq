/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { authorizeClientRequest, getClientPortalServiceClient } from '@/lib/auth/client-auth';

const DEFAULT_LIMIT = 50;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get('clientId');
  const limitParam = Number.parseInt(searchParams.get('limit') ?? '', 10);
  const limit = Number.isNaN(limitParam) ? DEFAULT_LIMIT : Math.min(Math.max(limitParam, 1), 200);
  const statusFilter = searchParams
    .get('status')
    ?.split(',')
    .map((status) => status.trim())
    .filter(Boolean);

  let auth: { user: User; clientId: string };
  try {
    const result = await authorizeClientRequest(req, { clientId, requirePortalEnabled: true });
    auth = { user: result.user, clientId: result.clientId };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unauthorized';
    const statusCode = message === 'Unauthorized' ? 401 : 403;
    return NextResponse.json({ error: message }, { status: statusCode });
  }

  let serviceClient;
  try {
    serviceClient = getClientPortalServiceClient();
  } catch (error) {
    console.error('[client-portal invoices] Supabase configuration error', error);
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 });
  }

  const query = (serviceClient.from('invoices') as any)
    .select(
      `id, invoice_number, status, due_date, created_at, total_cents, net_amount_cents, subtotal_cents, tax_cents, public_share_id, public_share_expires_at, stripe_hosted_url, stripe_pdf_url`,
    )
    .eq('client_id', auth.clientId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (statusFilter && statusFilter.length > 0) {
    query.in('status', statusFilter);
  }

  const result = await query;
  const data = result.data as Array<{
    id: string;
    invoice_number: string | null;
    status: string | null;
    due_date: string | null;
    created_at: string;
    total_cents: number | null;
    net_amount_cents: number | null;
    subtotal_cents: number | null;
    tax_cents: number | null;
    public_share_id: string | null;
    public_share_expires_at: string | null;
    stripe_hosted_url: string | null;
    stripe_pdf_url: string | null;
  }> | null;
  const error = result.error;

  if (error) {
    console.error('[client-portal invoices] Failed to load invoices', error);
    return NextResponse.json({ error: 'Unable to load invoices.' }, { status: 500 });
  }

  const invoices = (data ?? []).map((invoice) => {
    const totalCents = Number(invoice.total_cents ?? 0) || 0;
    const netCents = Number(invoice.net_amount_cents ?? 0) || 0;
    const amountDueCents = Math.max(0, totalCents - netCents);
    return {
      id: invoice.id,
      invoiceNumber: invoice.invoice_number,
      status: invoice.status,
      createdAt: invoice.created_at,
      dueDate: invoice.due_date,
      subtotalCents: Number(invoice.subtotal_cents ?? totalCents) || 0,
      taxCents: Number(invoice.tax_cents ?? 0) || 0,
      totalCents,
      amountDueCents,
      publicShareId: invoice.public_share_id,
      publicShareExpiresAt: invoice.public_share_expires_at,
      hostedUrl: invoice.stripe_hosted_url,
      pdfUrl: invoice.stripe_pdf_url,
    };
  });

  return NextResponse.json({ invoices });
}


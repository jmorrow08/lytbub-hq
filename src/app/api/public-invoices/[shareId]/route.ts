import { NextRequest, NextResponse } from 'next/server';
import { fetchPublicInvoice } from '@/lib/invoice-portal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ shareId: string }>;
};

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const { shareId } = await params;
    const invoice = await fetchPublicInvoice(shareId);
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found or expired.' }, { status: 404 });
    }
    return NextResponse.json({ invoice });
  } catch (error) {
    console.error('[api/public-invoices] unexpected error', error);
    const message =
      error instanceof Error ? error.message : 'Unable to load invoice. Check server logs.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { fetchPublicInvoice } from '@/lib/invoice-portal';

type RouteContext = { params: Promise<{ shareId: string }> };

export async function GET(_req: Request, context: RouteContext) {
  try {
    const { shareId } = await context.params;
    const invoice = await fetchPublicInvoice(shareId);
    if (!invoice) {
      return NextResponse.json({ ok: false, reason: 'not_found_or_expired' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, invoice });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, reason: 'unexpected', message }, { status: 500 });
  }
}

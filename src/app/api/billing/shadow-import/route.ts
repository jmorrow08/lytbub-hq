import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { createClient } from '@supabase/supabase-js';
import { parseShadowCsvText, extractShadowFromText } from '@/lib/shadow-parser';

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

    const formData = await req.formData();
    const invoiceId = formData.get('invoiceId');
    const file = formData.get('file');
    const apply = formData.get('apply') === 'true';

    if (typeof invoiceId !== 'string' || !invoiceId) {
      return NextResponse.json({ error: 'invoiceId is required.' }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file upload is required.' }, { status: 400 });
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

    // Verify invoice belongs to this user
    const { data: invoice, error: invError } = await supabase
      .from('invoices')
      .select('id, portal_payload, project_id, client_id, created_by')
      .eq('id', invoiceId)
      .eq('created_by', user.id)
      .maybeSingle();

    if (invError) {
      console.error('[api/billing/shadow-import] invoice lookup failed', invError);
      return NextResponse.json({ error: 'Unable to load invoice.' }, { status: 500 });
    }
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
    }

    const filename = file.name?.toLowerCase() || '';
    const isCsv = filename.endsWith('.csv') || file.type === 'text/csv';
    const isPdf = filename.endsWith('.pdf') || file.type === 'application/pdf';

    let shadowItems = [] as ReturnType<typeof parseShadowCsvText>['items'];
    let shadowSummary = undefined as ReturnType<typeof parseShadowCsvText>['summary'];
    let warnings: string[] = [];

    if (isCsv) {
      const text = await file.text();
      const result = parseShadowCsvText(text);
      shadowItems = result.items;
      shadowSummary = result.summary;
      warnings = result.warnings;
    } else if (isPdf) {
      // Best-effort PDF text extraction using dynamic import if available
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const pdfParse = (await import('pdf-parse')).default as unknown as (
          dataBuffer: ArrayBuffer | Buffer,
        ) => Promise<{ text: string }>;
        const arrayBuffer = await file.arrayBuffer();
        const parsed = await pdfParse(Buffer.from(arrayBuffer));
        const result = extractShadowFromText(parsed.text || '');
        shadowItems = result.items;
        shadowSummary = result.summary;
        warnings = result.warnings;
      } catch (e) {
        console.warn('[api/billing/shadow-import] pdf parsing unavailable', e);
        return NextResponse.json(
          {
            error:
              'PDF parsing is not available on this server. Please upload a CSV, or enable pdf-parse.',
          },
          { status: 400 },
        );
      }
    } else {
      return NextResponse.json(
        { error: 'Unsupported file type. Upload a CSV or PDF.' },
        { status: 400 },
      );
    }

    // Build payload merge
    const existingPayload =
      (invoice.portal_payload && typeof invoice.portal_payload === 'object'
        ? (invoice.portal_payload as Record<string, unknown>)
        : {}) ?? {};

    const mergedPayload: Record<string, unknown> = {
      ...existingPayload,
      shadowItems: shadowItems,
      shadowSummary: shadowSummary ?? existingPayload['shadowSummary'],
    };

    if (apply) {
      const { error: updateError } = await supabase
        .from('invoices')
        .update({ portal_payload: mergedPayload, updated_at: new Date().toISOString() })
        .eq('id', invoiceId)
        .eq('created_by', user.id);
      if (updateError) {
        console.error('[api/billing/shadow-import] failed to update portal payload', updateError);
        return NextResponse.json(
          { error: 'Parsed successfully, but failed to apply to invoice.' },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({
      shadowItems,
      shadowSummary,
      warnings,
      applied: Boolean(apply),
      portalPayload: mergedPayload,
    });
  } catch (error) {
    console.error('[api/billing/shadow-import] unexpected error', error);
    return NextResponse.json({ error: 'Unexpected server error.' }, { status: 500 });
  }
}

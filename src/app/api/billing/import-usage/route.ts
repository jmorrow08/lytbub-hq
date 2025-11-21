import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { createClient } from '@supabase/supabase-js';
import { parseUsageCsvText } from '@/lib/csv-parser';

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
    const projectId = formData.get('projectId');
    const billingPeriodId = formData.get('billingPeriodId');
    const file = formData.get('file');

    if (typeof projectId !== 'string' || !projectId) {
      return NextResponse.json({ error: 'projectId is required.' }, { status: 400 });
    }

    if (typeof billingPeriodId !== 'string' || !billingPeriodId) {
      return NextResponse.json({ error: 'billingPeriodId is required.' }, { status: 400 });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file upload is required.' }, { status: 400 });
    }

    const csvText = await file.text();
    const { rows, errors: parseErrors } = parseUsageCsvText(csvText);
    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'No usage rows detected in file.', details: parseErrors },
        { status: 400 }
      );
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

    const [{ data: project, error: projectError }, { data: period, error: periodError }] =
      await Promise.all([
        supabase
          .from('projects')
          .select('id, name, client_id')
          .eq('id', projectId)
          .eq('created_by', user.id)
          .maybeSingle(),
        supabase
          .from('billing_periods')
          .select('id, client_id')
          .eq('id', billingPeriodId)
          .eq('project_id', projectId)
          .eq('created_by', user.id)
          .maybeSingle(),
      ]);

    if (projectError) {
      console.error('[api/billing/import-usage] project lookup failed', projectError);
      return NextResponse.json({ error: 'Unable to load project.' }, { status: 500 });
    }

    if (!project) {
      return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    }

    if (!project.client_id) {
      return NextResponse.json({ error: 'Project must be linked to a client.' }, { status: 400 });
    }

    if (periodError) {
      console.error('[api/billing/import-usage] billing period lookup failed', periodError);
      return NextResponse.json({ error: 'Unable to load billing period.' }, { status: 500 });
    }

    if (!period) {
      return NextResponse.json({ error: 'Billing period not found.' }, { status: 404 });
    }

    if (period.client_id && period.client_id !== project.client_id) {
      return NextResponse.json({ error: 'Billing period does not belong to this client.' }, { status: 400 });
    }

    const normalizedRows = [];
    for (const row of rows) {
      const parsedDate = new Date(row.date);
      if (Number.isNaN(parsedDate.getTime())) {
        parseErrors.push(`Invalid date "${row.date}"`);
        continue;
      }

      const quantity = Number(row.quantity);
      if (!Number.isFinite(quantity) || quantity < 0) {
        parseErrors.push(`Invalid quantity "${row.quantity}"`);
        continue;
      }

      const unitPriceCents = Math.round(Number(row.unit_price) * 100);
      if (!Number.isFinite(unitPriceCents) || unitPriceCents < 0) {
        parseErrors.push(`Invalid unit price "${row.unit_price}"`);
        continue;
      }

      normalizedRows.push({
        project_id: projectId,
        billing_period_id: billingPeriodId,
        event_date: parsedDate.toISOString().slice(0, 10),
        metric_type: row.metric_type || 'usage',
        quantity,
        unit_price_cents: unitPriceCents,
        description: row.description || `${row.metric_type || 'Usage'} ${row.date}`,
        metadata: { client_name: row.client_name },
        created_by: user.id,
      });
    }

    if (normalizedRows.length === 0) {
      return NextResponse.json(
        { error: 'No valid rows to import.', details: parseErrors },
        { status: 400 }
      );
    }

    const { error: insertError } = await supabase.from('usage_events').insert(normalizedRows);
    if (insertError) {
      console.error('[api/billing/import-usage] insert failed', insertError);
      return NextResponse.json({ error: 'Failed to import usage rows.' }, { status: 500 });
    }

    return NextResponse.json({
      imported: normalizedRows.length,
      warnings: parseErrors,
      project: { id: project.id, name: project.name },
    });
  } catch (error) {
    console.error('[api/billing/import-usage] unexpected error', error);
    return NextResponse.json({ error: 'Unexpected server error.' }, { status: 500 });
  }
}

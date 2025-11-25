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
        { status: 400 },
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
      return NextResponse.json(
        { error: 'Billing period does not belong to this client.' },
        { status: 400 },
      );
    }

    let totalCostCents = 0;
    let totalTokens = 0;
    let validRows = 0;
    let firstDate: Date | null = null;
    let lastDate: Date | null = null;

    rows.forEach((row, index) => {
      const parsedDate = row.date ? new Date(row.date) : null;
      if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
        parseErrors.push(`Row ${index + 1}: invalid date "${row.date}"`);
        return;
      }

      const explicitTotal = typeof row.total_cost === 'number' ? row.total_cost : undefined;
      const derivedTotal = Number.isFinite(row.unit_price * row.quantity)
        ? row.unit_price * row.quantity
        : undefined;
      const costDollars = explicitTotal ?? derivedTotal;
      if (typeof costDollars !== 'number' || !Number.isFinite(costDollars) || costDollars <= 0) {
        parseErrors.push(`Row ${index + 1}: missing or invalid cost.`);
        return;
      }

      const costCents = Math.round(costDollars * 100);
      totalCostCents += costCents;

      const tokensValue =
        typeof row.total_tokens === 'number' && Number.isFinite(row.total_tokens)
          ? row.total_tokens
          : 0;
      totalTokens += tokensValue;

      validRows += 1;
      if (!firstDate || parsedDate < firstDate) firstDate = parsedDate;
      if (!lastDate || parsedDate > lastDate) lastDate = parsedDate;
    });

    if (validRows === 0 || totalCostCents <= 0) {
      return NextResponse.json(
        { error: 'No valid rows to import.', details: parseErrors },
        { status: 400 },
      );
    }

    const dateFormatter = (date: Date | null) =>
      date ? date.toISOString().slice(0, 10) : undefined;
    const startDate = dateFormatter(firstDate);
    const endDate = dateFormatter(lastDate);
    const tokenSegment =
      totalTokens > 0
        ? `${Intl.NumberFormat('en-US').format(Math.round(totalTokens))} tokens`
        : 'cost import';
    const rangeSegment =
      startDate && endDate ? `${startDate} → ${endDate}` : startDate || endDate || 'usage';
    const description = `AI usage ${rangeSegment} (${validRows} rows; ${tokenSegment})`;

    const aggregateRow = {
      project_id: projectId,
      billing_period_id: billingPeriodId,
      event_date: endDate || new Date().toISOString().slice(0, 10),
      metric_type: 'ai_usage',
      quantity: 1,
      unit_price_cents: totalCostCents,
      description,
      metadata: {
        total_rows: validRows,
        total_tokens: totalTokens,
        sum_cost_cents: totalCostCents,
        date_start: startDate,
        date_end: endDate,
        warnings: parseErrors,
      },
      created_by: user.id,
    };

    const { error: insertError } = await supabase.from('usage_events').insert(aggregateRow);
    if (insertError) {
      console.error('[api/billing/import-usage] insert failed', insertError);
      return NextResponse.json({ error: 'Failed to import usage rows.' }, { status: 500 });
    }

    return NextResponse.json({
      imported: validRows,
      warnings: parseErrors,
      totals: { cost_cents: totalCostCents, tokens: totalTokens },
      project: { id: project.id, name: project.name },
    });
  } catch (error) {
    console.error('[api/billing/import-usage] unexpected error', error);
    return NextResponse.json({ error: 'Unexpected server error.' }, { status: 500 });
  }
}

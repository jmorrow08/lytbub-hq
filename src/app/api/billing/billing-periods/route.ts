import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { createClient } from '@supabase/supabase-js';

export async function GET(req: Request) {
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

    const url = new URL(req.url);
    const projectId = url.searchParams.get('projectId');
    const clientId = url.searchParams.get('clientId');

    let query = supabase.from('billing_periods').select('*').eq('created_by', user.id);
    if (projectId) {
      query = query.eq('project_id', projectId);
    }
    if (clientId) {
      query = query.eq('client_id', clientId);
    }
    query = query.order('period_start', { ascending: false }).limit(100);

    const { data, error } = await query;
    if (error) {
      console.error('[api/billing/billing-periods] fetch failed', error);
      return NextResponse.json({ error: 'Unable to load billing periods.' }, { status: 500 });
    }

    return NextResponse.json({ periods: data ?? [] });
  } catch (error) {
    console.error('[api/billing/billing-periods] unexpected error', error);
    return NextResponse.json({ error: 'Unexpected server error.' }, { status: 500 });
  }
}

type CreateBillingPeriodPayload = {
  projectId: string;
  periodStart: string;
  periodEnd: string;
  notes?: string;
  clientId?: string;
};

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

    const payload = (await req.json()) as CreateBillingPeriodPayload;
    if (!payload?.projectId || !payload.periodStart || !payload.periodEnd) {
      return NextResponse.json(
        { error: 'projectId, periodStart, and periodEnd are required.' },
        { status: 400 },
      );
    }

    const periodStartDate = new Date(payload.periodStart);
    const periodEndDate = new Date(payload.periodEnd);
    if (Number.isNaN(periodStartDate.getTime()) || Number.isNaN(periodEndDate.getTime())) {
      return NextResponse.json({ error: 'Invalid date format.' }, { status: 400 });
    }

    if (periodEndDate < periodStartDate) {
      return NextResponse.json({ error: 'periodEnd must be after periodStart.' }, { status: 400 });
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

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, client_id')
      .eq('id', payload.projectId)
      .eq('created_by', user.id)
      .maybeSingle();

    if (projectError) {
      console.error('[api/billing/billing-periods] project lookup failed', projectError);
      return NextResponse.json({ error: 'Unable to load project.' }, { status: 500 });
    }

    if (!project) {
      return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    }

    const requestedClientId = payload.clientId ?? null;
    const projectClientId = project.client_id ?? null;
    const clientId = requestedClientId ?? projectClientId;

    if (requestedClientId) {
      const { data: clientLookup, error: clientError } = await supabase
        .from('clients')
        .select('id')
        .eq('id', requestedClientId)
        .eq('created_by', user.id)
        .maybeSingle();
      if (clientError) {
        console.error('[api/billing/billing-periods] client lookup failed', clientError);
        return NextResponse.json({ error: 'Unable to load client.' }, { status: 500 });
      }
      if (!clientLookup) {
        return NextResponse.json({ error: 'Client not found.' }, { status: 404 });
      }
    }

    if (projectClientId && clientId && projectClientId !== clientId) {
      return NextResponse.json(
        { error: 'Client does not match selected project.' },
        { status: 400 },
      );
    }

    if (!clientId) {
      return NextResponse.json(
        { error: 'Select a client for this billing period.' },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from('billing_periods')
      .insert({
        project_id: project.id,
        client_id: clientId,
        period_start: periodStartDate.toISOString().slice(0, 10),
        period_end: periodEndDate.toISOString().slice(0, 10),
        status: 'draft',
        notes: payload.notes,
        created_by: user.id,
      })
      .select('*')
      .single();

    if (error) {
      console.error('[api/billing/billing-periods] insert failed', error);
      return NextResponse.json({ error: 'Failed to create billing period.' }, { status: 500 });
    }

    return NextResponse.json({ period: data });
  } catch (error) {
    console.error('[api/billing/billing-periods] unexpected error', error);
    return NextResponse.json({ error: 'Unexpected server error.' }, { status: 500 });
  }
}

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

    const url = new URL(req.url);
    const billingPeriodId = url.searchParams.get('billingPeriodId');
    if (!billingPeriodId) {
      return NextResponse.json({ error: 'billingPeriodId is required.' }, { status: 400 });
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

    const { data, error } = await supabase
      .from('usage_events')
      .select('*')
      .eq('billing_period_id', billingPeriodId)
      .eq('created_by', user.id)
      .order('event_date', { ascending: false });

    if (error) {
      console.error('[api/billing/usage-events] fetch failed', error);
      return NextResponse.json({ error: 'Unable to load usage events.' }, { status: 500 });
    }

    return NextResponse.json({ events: data ?? [] });
  } catch (error) {
    console.error('[api/billing/usage-events] unexpected error', error);
    return NextResponse.json({ error: 'Unexpected server error.' }, { status: 500 });
  }
}


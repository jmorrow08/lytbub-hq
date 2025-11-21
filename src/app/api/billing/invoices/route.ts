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
    const projectId = url.searchParams.get('projectId');

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

    let query = supabase
      .from('invoices')
      .select('*, line_items:invoice_line_items(*)')
      .eq('created_by', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[api/billing/invoices] fetch failed', error);
      return NextResponse.json({ error: 'Unable to load invoices.' }, { status: 500 });
    }

    return NextResponse.json({ invoices: data ?? [] });
  } catch (error) {
    console.error('[api/billing/invoices] unexpected error', error);
    return NextResponse.json({ error: 'Unexpected server error.' }, { status: 500 });
  }
}


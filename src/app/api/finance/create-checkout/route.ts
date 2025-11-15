import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { error: 'Supabase client is not configured on the server.' },
        { status: 500 }
      );
    }

    const authHeader = req.headers.get('authorization') || '';
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const payload = await req.json();
    const amountCents = Number(payload?.amountCents);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      return NextResponse.json(
        { error: 'amountCents must be a positive number' },
        { status: 400 }
      );
    }

    console.log('[api/finance/create-checkout] invoking edge function', {
      amountCents,
      projectId: payload?.projectId || null,
    });

    const { data, error } = await supabase.functions.invoke('stripe_checkout_create', {
      body: {
        amountCents,
        description: payload?.description || undefined,
        projectId: payload?.projectId || undefined,
      },
    });

    if (error) {
      console.error('[api/finance/create-checkout] edge function error', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data ?? {});
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unexpected server error while creating checkout';
    console.error('[api/finance/create-checkout] unexpected server error', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}



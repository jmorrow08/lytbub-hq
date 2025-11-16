import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type CheckoutInvokePayload = {
  amountCents: number;
  description?: string;
  projectId?: string;
  customerEmail?: string;
};

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

    const authHeader = req.headers.get('authorization') ?? '';
    if (!authHeader.toLowerCase().startsWith('bearer ')) {
      return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
    }

    const payload = await req.json();
    const amountCents = Number(payload?.amountCents);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      return NextResponse.json(
        { error: 'amountCents must be a positive number' },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const invokePayload: CheckoutInvokePayload = {
      amountCents,
      description: payload?.description || undefined,
      projectId: payload?.projectId || undefined,
    };
    if (payload?.customerEmail) {
      invokePayload.customerEmail = payload.customerEmail;
    }

    console.log('[api/finance/create-checkout] invoking edge function', {
      amountCents,
      projectId: invokePayload.projectId ?? null,
    });

    const { data, error } = await supabase.functions.invoke('stripe_checkout_create', {
      body: invokePayload,
      headers: {
        Authorization: authHeader,
      },
    });

    if (error) {
      let status = 400;
      let edgeMessage = error.message;

      const rawBody = error?.context?.body;
      if (typeof error?.context?.status === 'number') {
        status = error.context.status;
      }
      if (rawBody) {
        try {
          const parsed = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
          if (parsed?.error) edgeMessage = parsed.error;
        } catch {
          // keep default edgeMessage
        }
      }

      console.error('[api/finance/create-checkout] edge function error', edgeMessage, {
        status,
        context: error?.context,
      });
      return NextResponse.json({ error: edgeMessage }, { status });
    }

    return NextResponse.json(data ?? {});
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unexpected server error while creating checkout';
    console.error('[api/finance/create-checkout] unexpected server error', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


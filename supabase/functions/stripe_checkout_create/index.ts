import Stripe from 'https://esm.sh/stripe@13.10.0?target=deno&deno-std=0.224.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.2';

type CreateCheckoutPayload = {
  amountCents?: number;
  currency?: string;
  description?: string;
  projectId?: string;
  clientId?: string;
  customerEmail?: string;
};

type CheckoutMetadata = {
  clientId: string;
  clientName: string;
};

const buildCors = (req: Request) => {
  const origin = req.headers.get('origin') ?? '*';
  // Return permissive CORS headers while still echoing the caller's origin.
  // Include common headers used by Supabase client and our app.
  const allowHeaders =
    'authorization, Authorization, x-client-info, apikey, content-type';
  return {
    'Access-Control-Allow-Origin': origin,
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': allowHeaders,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
  } as const;
};

Deno.serve(async (req) => {
  console.log('[stripe_checkout_create] start', { method: req.method });
  const cors = buildCors(req);
  const respond = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        ...cors,
        'Content-Type': 'application/json',
      },
    });

  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      status: 200,
      headers: {
        ...cors,
      },
    });
  }

  if (req.method !== 'POST') {
    return respond(405, { error: 'Method not allowed' });
  }

  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!stripeSecretKey) {
    console.error('Missing STRIPE_SECRET_KEY secret');
    return respond(500, { error: 'Stripe secret not configured' });
  }
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing Supabase env variables');
    return respond(500, { error: 'Supabase env not configured' });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return respond(401, { error: 'Missing Authorization header' });
  }

  let payload: CreateCheckoutPayload;
  try {
    payload = await req.json();
    console.log('[stripe_checkout_create] received body', payload);
  } catch (error) {
    console.error('Invalid JSON payload', error);
    return respond(400, { error: 'Invalid JSON payload' });
  }

  const amountCents = Number(payload.amountCents);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    console.log('[stripe_checkout_create] validation failed', { amountCents });
    return respond(400, { error: 'amountCents must be a positive number' });
  }

  const currency = (payload.currency || 'usd').toLowerCase();
  const description = payload.description?.trim() || 'Lytbub HQ Payment';
  console.log('[stripe_checkout_create] validation passed', {
    amountCents,
    currency,
    projectId: payload.projectId || null,
  });

  const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userError,
  } = await supabaseClient.auth.getUser();

  if (userError || !user) {
    console.error('Unable to resolve Supabase user', userError);
    return respond(401, { error: 'Unauthorized' });
  }

  const linkedProjectId: string | null = payload.projectId || null;
  const linkedClientId: string | null = payload.clientId || null;
  let projectMetadata: CheckoutMetadata | Record<string, never> = {};
  let resolvedClient: { id: string; name?: string | null } | null = null;
  let projectRecord:
    | { id: string; name?: string | null; client_id?: string | null; client?: { id: string; name?: string | null } | null }
    | null = null;

  if (linkedClientId) {
    const { data: clientRecord, error: clientError } = await supabaseClient
      .from('clients')
      .select('id, name')
      .eq('id', linkedClientId)
      .eq('created_by', user.id)
      .maybeSingle();

    if (clientError) {
      console.error('Failed to validate client', clientError);
      return respond(500, { error: 'Unable to validate client' });
    }

    if (!clientRecord) {
      return respond(400, { error: 'Client not found' });
    }
    resolvedClient = clientRecord;
  }

  if (linkedProjectId) {
    const { data, error: projectError } = await supabaseClient
      .from('projects')
      .select('id, name, client_id, client:clients(id, name)')
      .eq('id', linkedProjectId)
      .eq('created_by', user.id)
      .maybeSingle();

    if (projectError) {
      console.error('Failed to validate client project', projectError);
      return respond(500, { error: 'Unable to validate client project' });
    }

    if (!data) {
      return respond(400, { error: 'Client project not found' });
    }

    projectRecord = data;

    if (!resolvedClient) {
      resolvedClient =
        (data.client as { id: string; name?: string | null } | null) ||
        (data.client_id
          ? { id: data.client_id, name: data.name }
          : null);
    }
  }

  if (resolvedClient) {
    projectMetadata = {
      clientId: resolvedClient.id,
      clientName: resolvedClient.name || 'Client',
    };
  }

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: '2024-06-20',
  });

  const siteUrl =
    Deno.env.get('PUBLIC_SITE_URL') ||
    Deno.env.get('SITE_URL') ||
    'https://lytbub-hq.vercel.app';

  const paymentId = crypto.randomUUID();
  const successUrl = `${siteUrl}/payment/success?paymentId=${paymentId}`;
  const cancelUrl = `${siteUrl}/payment/cancel?paymentId=${paymentId}`;

  let session;
  try {
    console.log('[stripe_checkout_create] creating Stripe session');
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: description,
            },
            unit_amount: Math.round(amountCents),
          },
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: payload.customerEmail || undefined,
      metadata: projectMetadata,
    });
    console.log('[stripe_checkout_create] stripe session created', {
      sessionId: session.id,
    });
  } catch (error) {
    console.error('Stripe session creation failed', error);
    return respond(500, { error: 'Failed to create checkout session' });
  }

  const { data: paymentRow, error: insertError } = await supabaseClient
    .from('payments')
    .insert({
      created_by: user.id,
      project_id: linkedProjectId,
      client_id: resolvedClient?.id || linkedClientId || projectRecord?.client_id || null,
      amount_cents: amountCents,
      currency,
      description,
      link_type: 'checkout_session',
      stripe_id: session.id,
      url: session.url,
      id: paymentId,
    })
    .select('id')
    .single();

  if (insertError) {
    console.error('Failed to persist payment row', insertError);
    return respond(500, { error: 'Failed to log payment' });
  }

  console.log('[stripe_checkout_create] return payload', {
    paymentId: paymentRow.id,
    stripeId: session.id,
  });

  return respond(200, {
    url: session.url,
    paymentId: paymentRow.id,
  });
});

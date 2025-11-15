import Stripe from 'https://esm.sh/stripe@13.10.0?target=deno&deno-std=0.224.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.2';

type CreateCheckoutPayload = {
  amountCents?: number;
  currency?: string;
  description?: string;
  clientId?: string;
  customerEmail?: string;
};

const respond = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
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
  } catch (error) {
    console.error('Invalid JSON payload', error);
    return respond(400, { error: 'Invalid JSON payload' });
  }

  const amountCents = Number(payload.amountCents);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return respond(400, { error: 'amountCents must be a positive number' });
  }

  const currency = (payload.currency || 'usd').toLowerCase();
  const description = payload.description?.trim() || 'Lytbub HQ Payment';

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: '2024-06-20',
  });

  const siteUrl =
    Deno.env.get('PUBLIC_SITE_URL') ||
    Deno.env.get('SITE_URL') ||
    'https://lytbub-hq.vercel.app';

  const successUrl = `${siteUrl}/finance?status=success`;
  const cancelUrl = `${siteUrl}/finance?status=cancelled`;

  let session;
  try {
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
    });
  } catch (error) {
    console.error('Stripe session creation failed', error);
    return respond(500, { error: 'Failed to create checkout session' });
  }

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

  const linkedClientId: string | null = payload.clientId || null;
  if (linkedClientId) {
    const { data: clientRecord, error: clientError } = await supabaseClient
      .from('clients')
      .select('id')
      .eq('id', linkedClientId)
      .eq('created_by', user.id)
      .maybeSingle();

    if (clientError) {
      console.error('Failed to validate client ownership', clientError);
      return respond(500, { error: 'Unable to validate client' });
    }

    if (!clientRecord) {
      return respond(400, { error: 'Client not found' });
    }
  }

  const { data: paymentRow, error: insertError } = await supabaseClient
    .from('payments')
    .insert({
      created_by: user.id,
      client_id: linkedClientId,
      amount_cents: amountCents,
      currency,
      description,
      link_type: 'checkout_session',
      stripe_id: session.id,
      url: session.url,
    })
    .select('id')
    .single();

  if (insertError) {
    console.error('Failed to persist payment row', insertError);
    return respond(500, { error: 'Failed to log payment' });
  }

  return respond(200, {
    url: session.url,
    paymentId: paymentRow.id,
  });
});

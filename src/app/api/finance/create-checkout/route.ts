import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import type { CheckoutMetadata } from '@/types';

const STRIPE_API_VERSION: Stripe.LatestApiVersion = '2024-06-20';
const STRIPE_FUNCTION_NAME = 'stripe_checkout_create';

type CheckoutPayload = {
  amountCents: number;
  description?: string;
  projectId?: string;
  clientId?: string;
  customerEmail?: string;
};

type ClientSummary = {
  id: string;
  name?: string | null;
};

type ProjectSummary = {
  id: string;
  name?: string | null;
  client_id?: string | null;
  client?: ClientSummary | null;
  stripe_customer_id?: string | null;
};

export async function POST(req: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const supabaseFunctionsOrigin =
      process.env.SUPABASE_FUNCTIONS_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL ||
      deriveSupabaseFunctionsOrigin(supabaseUrl);

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { error: 'Supabase client is not configured on the server.' },
        { status: 500 },
      );
    }

    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
      return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
    }

    const payload = (await req.json()) as CheckoutPayload;
    const amountCents = Number(payload?.amountCents);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      return NextResponse.json({ error: 'amountCents must be a positive number' }, { status: 400 });
    }

    const rawDescription = payload?.description;
    const description =
      typeof rawDescription === 'string' && rawDescription.trim()
        ? rawDescription.trim()
        : 'Lytbub HQ Payment';
    const currency = 'usd';
    const projectId = payload?.projectId || null;
    const clientId = payload?.clientId || null;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error('[api/finance/create-checkout] Unable to resolve Supabase user', userError);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let projectRecord: ProjectSummary | null = null;
    let clientRecord: ClientSummary | null = null;

    if (clientId) {
      const { data, error: clientError } = await supabase
        .from('clients')
        .select('id, name')
        .eq('id', clientId)
        .eq('created_by', user.id)
        .maybeSingle();

      if (clientError) {
        console.error('[api/finance/create-checkout] Failed to validate client', clientError);
        return NextResponse.json(
          { error: 'Unable to validate the selected client.' },
          { status: 500 },
        );
      }

      if (!data) {
        return NextResponse.json({ error: 'Client not found.' }, { status: 400 });
      }
      clientRecord = data;
    }

    if (projectId) {
      const { data: projectData, error: projectError } = await supabase
        .from('projects')
        .select('id, name, client_id, stripe_customer_id, client:clients(id, name)')
        .eq('id', projectId)
        .eq('created_by', user.id)
        .maybeSingle();

      if (projectError) {
        console.error(
          '[api/finance/create-checkout] Failed to validate client project',
          projectError,
        );
        return NextResponse.json(
          { error: 'Unable to validate the selected client project.' },
          { status: 500 },
        );
      }

      if (!projectData) {
        return NextResponse.json({ error: 'Client project not found.' }, { status: 400 });
      }
      const rawClient =
        Array.isArray((projectData as any).client) && (projectData as any).client.length > 0
          ? (projectData as any).client[0]
          : (projectData as any).client ?? null;
      const normalizedClient =
        rawClient && typeof rawClient.id === 'string'
          ? ({
              id: rawClient.id,
              name: typeof rawClient.name === 'string' ? rawClient.name : null,
            } satisfies ClientSummary)
          : null;

      projectRecord = {
        id: projectData.id,
        name: projectData.name ?? null,
        client_id: projectData.client_id ?? null,
        client: normalizedClient,
        stripe_customer_id: (projectData as any).stripe_customer_id ?? null,
      };

      if (!clientRecord) {
        const candidate: ClientSummary | null =
          normalizedClient ??
          (typeof (projectData as any).client_id === 'string'
            ? {
                id: (projectData as any).client_id,
                name:
                  typeof (projectData as any).name === 'string' ? (projectData as any).name : null,
              }
            : null);
        clientRecord = candidate;
      }
    }

    const resolvedClient = clientRecord;

    const clientMetadata: CheckoutMetadata | Record<string, never> =
      resolvedClient !== null
        ? {
            clientId: resolvedClient.id,
            clientName: resolvedClient.name || 'Client',
          }
        : {};

    if (!stripeSecretKey) {
      if (!supabaseFunctionsOrigin) {
        console.error(
          '[api/finance/create-checkout] Missing both STRIPE secret and Supabase functions origin',
        );
        return NextResponse.json(
          {
            error:
              'Stripe is not configured on this deployment. Please set STRIPE_SECRET_KEY or SUPABASE_FUNCTIONS_URL.',
          },
          { status: 500 },
        );
      }

      return forwardToSupabaseFunction({
        authHeader,
        supabaseFunctionsOrigin,
        body: {
          amountCents: Math.round(amountCents),
          description,
          projectId: projectId ?? undefined,
          clientId: clientId ?? undefined,
          customerEmail: payload?.customerEmail,
        },
      });
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: STRIPE_API_VERSION });
    const paymentId = crypto.randomUUID();
    const siteUrl =
      process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://lytbub-hq.vercel.app';

    let session: Stripe.Response<Stripe.Checkout.Session>;
    const allowedPmTypes = (
      process.env.STRIPE_CHECKOUT_PAYMENT_METHOD_TYPES ||
      process.env.STRIPE_PAYMENT_METHOD_TYPES ||
      process.env.NEXT_PUBLIC_STRIPE_PAYMENT_METHOD_TYPES ||
      'card,us_bank_account,link'
    )
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [
          {
            price_data: {
              currency,
              product_data: { name: description },
              unit_amount: Math.round(amountCents),
            },
            quantity: 1,
          },
        ],
        customer: projectRecord?.stripe_customer_id || undefined,
        payment_method_types:
          allowedPmTypes as Stripe.Checkout.SessionCreateParams.PaymentMethodType[],
        billing_address_collection: 'required',
        payment_method_collection: 'always',
        automatic_tax: { enabled: true },
        success_url: `${siteUrl}/payment/success?paymentId=${paymentId}`,
        cancel_url: `${siteUrl}/payment/cancel?paymentId=${paymentId}`,
        customer_email: payload?.customerEmail || undefined,
        metadata: clientMetadata as Stripe.MetadataParam,
      });
    } catch (error) {
      console.error('[api/finance/create-checkout] Stripe session creation failed', error);
      return NextResponse.json(
        { error: 'Failed to create the Stripe checkout session.' },
        { status: 500 },
      );
    }

    if (!session?.url) {
      console.error('[api/finance/create-checkout] Stripe did not return a checkout URL', session);
      return NextResponse.json({ error: 'Stripe did not return a checkout URL.' }, { status: 502 });
    }

    const { data: paymentRow, error: insertError } = await supabase
      .from('payments')
      .insert({
        id: paymentId,
        created_by: user.id,
        project_id: projectId,
        client_id: clientId || resolvedClient?.id || projectRecord?.client_id || null,
        amount_cents: Math.round(amountCents),
        currency,
        description,
        link_type: 'checkout_session',
        stripe_id: session.id,
        url: session.url,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('[api/finance/create-checkout] Failed to persist payment row', insertError);
      return NextResponse.json(
        { error: 'Failed to log the payment in Supabase.' },
        { status: 500 },
      );
    }

    return NextResponse.json({ url: session.url, paymentId: paymentRow.id });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unexpected server error while creating checkout';
    console.error('[api/finance/create-checkout] unexpected server error', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function deriveSupabaseFunctionsOrigin(supabaseUrl?: string | null): string | null {
  if (!supabaseUrl) return null;
  try {
    const parsed = new URL(supabaseUrl);
    if (!parsed.host.includes('.supabase.')) return null;
    const functionHost = parsed.host.replace('.supabase.', '.functions.supabase.');
    return `${parsed.protocol}//${functionHost}`;
  } catch (error) {
    console.error(
      '[api/finance/create-checkout] Unable to derive Supabase functions origin',
      error,
    );
    return null;
  }
}

async function forwardToSupabaseFunction({
  authHeader,
  supabaseFunctionsOrigin,
  body,
}: {
  authHeader: string;
  supabaseFunctionsOrigin: string;
  body: CheckoutPayload;
}) {
  const endpoint = `${supabaseFunctionsOrigin.replace(/\/$/, '')}/${STRIPE_FUNCTION_NAME}`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify(body),
    });

    const text = await response.text();
    if (text) {
      try {
        const data = JSON.parse(text) as Record<string, unknown>;
        return NextResponse.json(data, { status: response.status });
      } catch (error) {
        console.error(
          '[api/finance/create-checkout] Invalid JSON from Supabase function',
          error,
          text,
        );
        return NextResponse.json(
          { error: 'Payment service returned invalid response.' },
          { status: 502 },
        );
      }
    }

    return NextResponse.json({}, { status: response.status });
  } catch (error) {
    console.error('[api/finance/create-checkout] Supabase function proxy failed', error);
    return NextResponse.json(
      { error: 'Payment service is unavailable. Please try again later.' },
      { status: 502 },
    );
  }
}

import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { createClient } from '@supabase/supabase-js';
import { createBillingPortalSession, createOrUpdateCustomer } from '@/lib/stripe';

type PortalPayload = {
  projectId: string;
  returnUrl?: string;
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

    const payload = (await req.json()) as PortalPayload;
    if (!payload?.projectId) {
      return NextResponse.json({ error: 'projectId is required.' }, { status: 400 });
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

    // Load project and linked client for Stripe customer details
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, name, client_id, stripe_customer_id, created_by')
      .eq('id', payload.projectId)
      .eq('created_by', user.id)
      .maybeSingle();

    if (projectError) {
      console.error('[api/billing/portal] project lookup failed', projectError);
      return NextResponse.json({ error: 'Unable to load project.' }, { status: 500 });
    }
    if (!project) {
      return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    }
    if (!project.client_id) {
      return NextResponse.json({ error: 'Project must be linked to a client.' }, { status: 400 });
    }

    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, name, company_name, email, phone, stripe_customer_id')
      .eq('id', project.client_id)
      .eq('created_by', user.id)
      .maybeSingle();

    if (clientError) {
      console.error('[api/billing/portal] client lookup failed', clientError);
      return NextResponse.json({ error: 'Unable to load client.' }, { status: 500 });
    }
    if (!client) {
      return NextResponse.json({ error: 'Client not found.' }, { status: 404 });
    }

    // Ensure Stripe customer exists and is tracked at the client level
    let stripeCustomerId: string | null =
      client.stripe_customer_id || project.stripe_customer_id || null;

    if (!client.stripe_customer_id && project.stripe_customer_id) {
      await supabase
        .from('clients')
        .update({
          stripe_customer_id: project.stripe_customer_id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', client.id)
        .eq('created_by', user.id);
    }

    if (!stripeCustomerId) {
      const customer = await createOrUpdateCustomer({
        customerId: null,
        email: client.email,
        name: client.name || client.company_name || undefined,
        phone: client.phone || undefined,
        metadata: {
          client_id: client.id,
          project_id: project.id,
        },
      });
      stripeCustomerId = customer.id;
      const { error: updateError } = await supabase
        .from('clients')
        .update({ stripe_customer_id: customer.id, updated_at: new Date().toISOString() })
        .eq('id', client.id);
      if (updateError) {
        console.error('[api/billing/portal] failed to persist Stripe customer id', updateError);
      }
      if (!project.stripe_customer_id) {
        await supabase
          .from('projects')
          .update({ stripe_customer_id: customer.id, updated_at: new Date().toISOString() })
          .eq('id', project.id);
      }
    }

    const siteUrl =
      process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://lytbub-hq.vercel.app';
    const returnUrl =
      payload.returnUrl && typeof payload.returnUrl === 'string'
        ? payload.returnUrl
        : `${siteUrl.replace(/\/$/, '')}/billing`;

    const configurationId = process.env.STRIPE_BILLING_PORTAL_CONFIGURATION_ID || undefined;
    const session = await createBillingPortalSession({
      customerId: stripeCustomerId!,
      returnUrl,
      configurationId,
    });

    if (!session?.url) {
      return NextResponse.json({ error: 'Stripe did not return a portal URL.' }, { status: 502 });
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('[api/billing/portal] unexpected error', error);
    const message = error instanceof Error ? error.message : 'Unexpected server error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

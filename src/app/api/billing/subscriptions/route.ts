import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { createClient } from '@supabase/supabase-js';
import { createOrUpdateCustomer, setupSubscription } from '@/lib/stripe';

type SubscriptionUpdatePayload = {
  projectId: string;
  subscriptionEnabled?: boolean;
  baseRetainerCents?: number | null;
  autoPayEnabled?: boolean;
  paymentMethodType?: 'card' | 'ach' | 'offline';
  achDiscountCents?: number;
  notifyUsageEvents?: boolean;
};

export async function PATCH(req: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 });
    }
    const hasStripeSecret = Boolean(process.env.STRIPE_SECRET_KEY);

    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
      return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
    }

    const payload = (await req.json()) as SubscriptionUpdatePayload;
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

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', payload.projectId)
      .eq('created_by', user.id)
      .maybeSingle();

    if (projectError) {
      console.error('[api/billing/subscriptions] project lookup failed', projectError);
      return NextResponse.json({ error: 'Unable to load project.' }, { status: 500 });
    }

    if (!project) {
      return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    }

    if (!project.client_id) {
      return NextResponse.json(
        { error: 'Project must be linked to a client first.' },
        { status: 400 },
      );
    }

    // Load the linked client so we can sync with Stripe
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, name, company_name, email, phone')
      .eq('id', project.client_id)
      .eq('created_by', user.id)
      .maybeSingle();

    if (clientError) {
      console.error('[api/billing/subscriptions] client lookup failed', clientError);
      return NextResponse.json({ error: 'Unable to load client.' }, { status: 500 });
    }

    if (!client) {
      return NextResponse.json({ error: 'Client not found.' }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};
    if (typeof payload.subscriptionEnabled === 'boolean') {
      updates.subscription_enabled = payload.subscriptionEnabled;
    }
    if (typeof payload.autoPayEnabled === 'boolean') {
      updates.auto_pay_enabled = payload.autoPayEnabled;
    }
    if (typeof payload.paymentMethodType === 'string') {
      updates.payment_method_type = payload.paymentMethodType;
    }
    if (typeof payload.baseRetainerCents === 'number' || payload.baseRetainerCents === null) {
      updates.base_retainer_cents = payload.baseRetainerCents;
    }
    if (typeof payload.achDiscountCents === 'number') {
      updates.ach_discount_cents = Math.max(0, payload.achDiscountCents);
    }
    if (typeof payload.notifyUsageEvents === 'boolean') {
      updates.notify_usage_events = payload.notifyUsageEvents;
    }

    // Determine effective subscription + base retainer after this update
    const subscriptionEnabled =
      typeof payload.subscriptionEnabled === 'boolean'
        ? payload.subscriptionEnabled
        : Boolean(project.subscription_enabled);
    const baseRetainerCents =
      typeof payload.baseRetainerCents === 'number'
        ? payload.baseRetainerCents
        : project.base_retainer_cents ?? 0;

    let stripeCustomerId: string | null = project.stripe_customer_id || null;
    let stripeSubscriptionId: string | null = project.stripe_subscription_id || null;

    // Ensure a Stripe customer exists when subscriptions are enabled
    if (subscriptionEnabled && !stripeCustomerId) {
      if (!hasStripeSecret) {
        // Stripe not configured; skip remote call but continue persisting local settings
        console.warn(
          '[api/billing/subscriptions] Skipping Stripe customer creation — STRIPE_SECRET_KEY missing',
        );
      } else {
        try {
          const customer = await createOrUpdateCustomer({
            customerId: null,
            email: client.email,
            name: client.name || client.company_name || undefined,
            phone: client.phone,
            metadata: {
              client_id: client.id,
              project_id: project.id,
            },
          });
          stripeCustomerId = customer.id;
          updates.stripe_customer_id = customer.id;
        } catch (e) {
          console.error('[api/billing/subscriptions] Stripe customer create failed', e);
          return NextResponse.json(
            {
              error:
                e instanceof Error
                  ? e.message
                  : 'Unable to create Stripe customer. Please check Stripe configuration.',
            },
            { status: 502 },
          );
        }
      }
    }

    // Ensure a Stripe subscription exists for the base retainer
    if (subscriptionEnabled && baseRetainerCents > 0 && stripeCustomerId && !stripeSubscriptionId) {
      if (!hasStripeSecret) {
        console.warn(
          '[api/billing/subscriptions] Skipping Stripe subscription creation — STRIPE_SECRET_KEY missing',
        );
      } else {
        try {
          const subscription = await setupSubscription({
            customerId: stripeCustomerId,
            amountCents: baseRetainerCents,
            productName: `${project.name || 'Client'} Monthly Retainer`,
            metadata: {
              client_id: client.id,
              project_id: project.id,
            },
          });
          stripeSubscriptionId = subscription.id;
          updates.stripe_subscription_id = subscription.id;
        } catch (e) {
          console.error('[api/billing/subscriptions] Stripe subscription create failed', e);
          return NextResponse.json(
            {
              error:
                e instanceof Error
                  ? e.message
                  : 'Unable to create Stripe subscription. Please check Stripe configuration.',
            },
            { status: 502 },
          );
        }
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ project });
    }

    const { data: updated, error: updateError } = await supabase
      .from('projects')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', project.id)
      .select('*')
      .single();

    if (updateError || !updated) {
      console.error('[api/billing/subscriptions] update failed', updateError);
      return NextResponse.json(
        { error: 'Unable to update subscription settings.' },
        { status: 500 },
      );
    }

    return NextResponse.json({ project: updated });
  } catch (error) {
    console.error('[api/billing/subscriptions] unexpected error', error);
    const message = error instanceof Error ? error.message : 'Unexpected server error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

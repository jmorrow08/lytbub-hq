import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { createClient } from '@supabase/supabase-js';

type SubscriptionUpdatePayload = {
  projectId: string;
  subscriptionEnabled?: boolean;
  baseRetainerCents?: number | null;
  autoPayEnabled?: boolean;
  paymentMethodType?: 'card' | 'ach' | 'offline';
  achDiscountCents?: number;
};

export async function PATCH(req: Request) {
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
      .eq('type', 'client')
      .maybeSingle();

    if (projectError) {
      console.error('[api/billing/subscriptions] project lookup failed', projectError);
      return NextResponse.json({ error: 'Unable to load project.' }, { status: 500 });
    }

    if (!project) {
      return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
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
      return NextResponse.json({ error: 'Unable to update subscription settings.' }, { status: 500 });
    }

    return NextResponse.json({ project: updated });
  } catch (error) {
    console.error('[api/billing/subscriptions] unexpected error', error);
    return NextResponse.json({ error: 'Unexpected server error.' }, { status: 500 });
  }
}


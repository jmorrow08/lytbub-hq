import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { createClient } from '@supabase/supabase-js';

type UpdatePayload = {
  description?: string;
  quantity?: number | string;
  unitPriceCents?: number | string;
  status?: 'pending' | 'billed' | 'voided';
  metadata?: Record<string, unknown> | null;
  clientId?: string | null;
};

const ensureSupabase = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase is not configured.');
  }
  return { supabaseUrl, supabaseAnonKey };
};

async function resolveUser(supabaseUrl: string, supabaseAnonKey: string, authHeader: string) {
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw Object.assign(new Error('Unauthorized'), { status: 401 });
  }

  return { supabase, user };
}

function normalizeUpdate(payload: UpdatePayload | null): UpdatePayload | null {
  if (!payload || typeof payload !== 'object') return null;
  const cleaned: UpdatePayload = {};

  if (typeof payload.description === 'string') {
    const trimmed = payload.description.trim();
    if (trimmed.length === 0) {
      throw Object.assign(new Error('description cannot be empty.'), { status: 400 });
    }
    cleaned.description = trimmed;
  }

  if (payload.quantity !== undefined) {
    const quantity =
      typeof payload.quantity === 'number'
        ? payload.quantity
        : Number.parseFloat(String(payload.quantity));
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw Object.assign(new Error('quantity must be greater than 0.'), { status: 400 });
    }
    cleaned.quantity = quantity;
  }

  if (payload.unitPriceCents !== undefined) {
    const unit =
      typeof payload.unitPriceCents === 'number'
        ? payload.unitPriceCents
        : Number.parseInt(String(payload.unitPriceCents), 10);
    if (!Number.isFinite(unit) || unit <= 0) {
      throw Object.assign(new Error('unitPriceCents must be a positive number.'), { status: 400 });
    }
    cleaned.unitPriceCents = Math.round(unit);
  }

  if (payload.status !== undefined) {
    if (
      payload.status !== 'pending' &&
      payload.status !== 'voided' &&
      payload.status !== 'billed'
    ) {
      throw Object.assign(new Error('status must be pending, billed, or voided.'), { status: 400 });
    }
    cleaned.status = payload.status;
  }

  if (payload.metadata !== undefined) {
    cleaned.metadata = payload.metadata;
  }

  if (payload.clientId !== undefined) {
    cleaned.clientId = payload.clientId;
  }

  return cleaned;
}

type RouteContext = {
  params: Promise<{ itemId: string }>;
};

export async function PATCH(req: Request, context: RouteContext) {
  try {
    const { supabaseUrl, supabaseAnonKey } = ensureSupabase();
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
      return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
    }

    const { itemId } = await context.params;
    const payload = normalizeUpdate((await req.json().catch(() => null)) as UpdatePayload | null);
    if (!payload || Object.keys(payload).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 });
    }

    const { supabase, user } = await resolveUser(supabaseUrl, supabaseAnonKey, authHeader);

    // If clientId is provided, ensure the user owns it
    if (payload.clientId) {
      const { data: client, error: clientError } = await supabase
        .from('clients')
        .select('id')
        .eq('id', payload.clientId)
        .eq('created_by', user.id)
        .maybeSingle();

      if (clientError) {
        console.error('[api/billing/pending-items/:id] client lookup failed', clientError);
        return NextResponse.json({ error: 'Unable to validate client.' }, { status: 500 });
      }

      if (!client) {
        return NextResponse.json({ error: 'Client not found.' }, { status: 400 });
      }
    }

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (payload.description !== undefined) updatePayload.description = payload.description;
    if (payload.quantity !== undefined) updatePayload.quantity = payload.quantity;
    if (payload.unitPriceCents !== undefined)
      updatePayload.unit_price_cents = payload.unitPriceCents;
    if (payload.status !== undefined) updatePayload.status = payload.status;
    if (payload.metadata !== undefined) updatePayload.metadata = payload.metadata;
    if (payload.clientId !== undefined) updatePayload.client_id = payload.clientId;

    const { data: updated, error: updateError } = await supabase
      .from('pending_invoice_items')
      .update(updatePayload)
      .eq('id', itemId)
      .eq('created_by', user.id)
      .select('*, project:projects(*), client:clients(*)')
      .maybeSingle();

    if (updateError) {
      console.error('[api/billing/pending-items/:id] update failed', updateError);
      return NextResponse.json({ error: 'Unable to update pending item.' }, { status: 500 });
    }

    if (!updated) {
      return NextResponse.json({ error: 'Pending item not found.' }, { status: 404 });
    }

    return NextResponse.json({ item: updated });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    if (status >= 500) {
      console.error('[api/billing/pending-items/:id] unexpected error', error);
    }
    return NextResponse.json({ error: (error as Error).message }, { status });
  }
}

export async function DELETE(req: Request, context: RouteContext) {
  try {
    const { supabaseUrl, supabaseAnonKey } = ensureSupabase();
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
      return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
    }

    const { itemId } = await context.params;
    const { supabase, user } = await resolveUser(supabaseUrl, supabaseAnonKey, authHeader);

    const { data: item, error: fetchError } = await supabase
      .from('pending_invoice_items')
      .select('id, source_type, source_ref_id, metadata')
      .eq('id', itemId)
      .eq('created_by', user.id)
      .maybeSingle();

    if (fetchError) {
      console.error('[api/billing/pending-items/:id] lookup failed', fetchError);
      return NextResponse.json({ error: 'Unable to load pending item.' }, { status: 500 });
    }

    if (!item) {
      return NextResponse.json({ error: 'Pending item not found.' }, { status: 404 });
    }

    if (item.source_type === 'usage') {
      const metadata = (item.metadata || {}) as { usage_event_id?: string | null };
      const usageEventId = item.source_ref_id || metadata.usage_event_id || null;
      if (usageEventId) {
        const { error: usageDeleteError } = await supabase
          .from('usage_events')
          .delete()
          .eq('id', usageEventId)
          .eq('created_by', user.id);
        if (usageDeleteError) {
          console.error(
            '[api/billing/pending-items/:id] usage event delete failed',
            usageDeleteError,
          );
          return NextResponse.json(
            { error: 'Unable to delete associated usage event.' },
            { status: 500 },
          );
        }
      }
    }

    const { error: deleteError } = await supabase
      .from('pending_invoice_items')
      .delete()
      .eq('id', itemId)
      .eq('created_by', user.id);

    if (deleteError) {
      console.error('[api/billing/pending-items/:id] delete failed', deleteError);
      return NextResponse.json({ error: 'Unable to delete pending item.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    if (status >= 500) {
      console.error('[api/billing/pending-items/:id] unexpected delete error', error);
    }
    return NextResponse.json({ error: (error as Error).message }, { status });
  }
}

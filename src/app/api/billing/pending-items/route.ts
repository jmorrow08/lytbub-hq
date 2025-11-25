import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { createClient } from '@supabase/supabase-js';

type PendingItemsQuery = {
  projectId?: string | null;
  clientId?: string | null;
  status?: 'pending' | 'billed' | 'voided' | 'all';
  limit?: number | null;
};

type PendingItemInput = {
  projectId?: string;
  clientId?: string | null;
  sourceType?: 'usage' | 'task' | 'manual';
  sourceRefId?: string | null;
  description?: string;
  quantity?: number | string;
  unitPriceCents?: number | string;
  metadata?: Record<string, unknown> | null;
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

function parseQuery(req: Request): PendingItemsQuery {
  const url = new URL(req.url);
  const statusParam = url.searchParams.get('status');
  const limitParam = url.searchParams.get('limit');
  const status =
    statusParam === 'pending' || statusParam === 'billed' || statusParam === 'voided'
      ? statusParam
      : statusParam === 'all'
      ? 'all'
      : 'pending';

  const limit = limitParam ? Number.parseInt(limitParam, 10) : null;
  return {
    status,
    limit: Number.isFinite(limit || NaN) && (limit ?? 0) > 0 ? limit : null,
    projectId: url.searchParams.get('projectId'),
    clientId: url.searchParams.get('clientId'),
  };
}

export async function GET(req: Request) {
  try {
    const { supabaseUrl, supabaseAnonKey } = ensureSupabase();
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
      return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
    }

    const { supabase, user } = await resolveUser(supabaseUrl, supabaseAnonKey, authHeader);
    const { projectId, clientId, status, limit } = parseQuery(req);

    let query = supabase
      .from('pending_invoice_items')
      .select('*, project:projects(*), client:clients(*)')
      .eq('created_by', user.id)
      .order('created_at', { ascending: false });

    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    if (clientId) {
      query = query.eq('client_id', clientId);
    }

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[api/billing/pending-items] fetch failed', error);
      return NextResponse.json({ error: 'Unable to load pending items.' }, { status: 500 });
    }

    return NextResponse.json({ items: data ?? [] });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    if (status >= 500) {
      console.error('[api/billing/pending-items] unexpected error', error);
    }
    return NextResponse.json({ error: (error as Error).message }, { status });
  }
}

function normalizeItem(input: PendingItemInput): PendingItemInput | null {
  if (!input || typeof input !== 'object') return null;
  if (!input.projectId || typeof input.projectId !== 'string') return null;
  if (!input.description || typeof input.description !== 'string') return null;
  if (input.unitPriceCents === undefined || input.unitPriceCents === null) return null;
  return input;
}

export async function POST(req: Request) {
  try {
    const { supabaseUrl, supabaseAnonKey } = ensureSupabase();
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
      return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
    }

    const payload = (await req.json().catch(() => null)) as
      | { items?: PendingItemInput[] }
      | PendingItemInput
      | null;

    let rawItems: PendingItemInput[] = [];

    if (payload && typeof payload === 'object') {
      if ('items' in payload) {
        const items = Array.isArray(payload.items) ? payload.items : [];
        rawItems = items.filter((item): item is PendingItemInput => !!item);
      } else {
        rawItems = [payload as PendingItemInput];
      }
    }

    const normalized = rawItems
      .map((item) => normalizeItem(item))
      .filter((item): item is PendingItemInput => item !== null);

    if (normalized.length === 0) {
      return NextResponse.json(
        { error: 'Provide at least one valid pending item.' },
        { status: 400 },
      );
    }

    const { supabase, user } = await resolveUser(supabaseUrl, supabaseAnonKey, authHeader);

    const uniqueProjectIds = Array.from(new Set(normalized.map((item) => item.projectId)));
    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .select('id, client_id')
      .in('id', uniqueProjectIds)
      .eq('created_by', user.id);

    if (projectsError) {
      console.error('[api/billing/pending-items] project lookup failed', projectsError);
      return NextResponse.json({ error: 'Unable to verify projects.' }, { status: 500 });
    }

    if (!projects || projects.length !== uniqueProjectIds.length) {
      return NextResponse.json(
        { error: 'One or more projects are invalid or inaccessible.' },
        { status: 400 },
      );
    }

    const projectMap = new Map(projects.map((project) => [project.id, project.client_id]));

    const records = normalized.map((item) => {
      const rawQuantity =
        typeof item.quantity === 'number'
          ? item.quantity
          : typeof item.quantity === 'string'
          ? Number.parseFloat(item.quantity)
          : 1;
      const quantity = Number.isFinite(rawQuantity) && rawQuantity > 0 ? rawQuantity : 1;
      const rawUnit =
        typeof item.unitPriceCents === 'number'
          ? item.unitPriceCents
          : Number.parseInt(String(item.unitPriceCents), 10);
      const unitPriceCents = Number.isFinite(rawUnit) && rawUnit >= 0 ? Math.round(rawUnit) : 0;

      if (unitPriceCents <= 0) {
        throw Object.assign(new Error('unitPriceCents must be positive.'), { status: 400 });
      }

      return {
        created_by: user.id,
        project_id: item.projectId,
        client_id: item.clientId ?? projectMap.get(item.projectId) ?? null,
        source_type: item.sourceType ?? 'manual',
        source_ref_id: item.sourceRefId ?? null,
        description: item.description!.trim(),
        quantity,
        unit_price_cents: unitPriceCents,
        metadata: item.metadata ?? null,
      };
    });

    const { data: inserted, error: insertError } = await supabase
      .from('pending_invoice_items')
      .insert(records)
      .select('*, project:projects(*), client:clients(*)');

    if (insertError) {
      console.error('[api/billing/pending-items] insert failed', insertError);
      return NextResponse.json({ error: 'Unable to create pending items.' }, { status: 500 });
    }

    return NextResponse.json({ items: inserted ?? [] }, { status: 201 });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    if (status >= 500) {
      console.error('[api/billing/pending-items] unexpected error', error);
    }
    return NextResponse.json({ error: (error as Error).message }, { status });
  }
}

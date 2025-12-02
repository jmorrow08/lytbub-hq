import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { authorizeClientRequest, getClientPortalServiceClient } from '@/lib/auth/client-auth';

const DEFAULT_DAYS = 30;
const MAX_EVENTS = 500;

function getDateRange(searchParams: URLSearchParams) {
  const endParam = searchParams.get('endDate');
  const startParam = searchParams.get('startDate');
  const now = new Date();
  const endDate = endParam ? new Date(endParam) : now;
  const startDate = startParam
    ? new Date(startParam)
    : new Date(now.getTime() - DEFAULT_DAYS * 24 * 60 * 60 * 1000);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new Error('Invalid date range.');
  }

  return {
    startDate: startDate.toISOString().slice(0, 10),
    endDate: endDate.toISOString().slice(0, 10),
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get('clientId');
  const groupMode = searchParams.get('groupBy') ?? 'metric';

  let dateRange;
  try {
    dateRange = getDateRange(searchParams);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid date range.' },
      { status: 400 },
    );
  }

  let auth: { user: User; clientId: string };
  try {
    const result = await authorizeClientRequest(req, { clientId, requirePortalEnabled: true });
    auth = { user: result.user, clientId: result.clientId };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unauthorized';
    const statusCode = message === 'Unauthorized' ? 401 : 403;
    return NextResponse.json({ error: message }, { status: statusCode });
  }

  let serviceClient;
  try {
    serviceClient = getClientPortalServiceClient();
  } catch (error) {
    console.error('[client-portal usage] Supabase configuration error', error);
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 });
  }

  const { data: projectRows, error: projectError } = await serviceClient
    .from('projects')
    .select('id, name')
    .eq('client_id', auth.clientId);

  if (projectError) {
    console.error('[client-portal usage] Failed to load project list', projectError);
    return NextResponse.json({ error: 'Unable to load usage data.' }, { status: 500 });
  }

  const projectIds = (projectRows ?? []).map((project) => project.id);
  if (projectIds.length === 0) {
    return NextResponse.json({
      summary: { totalCostCents: 0, totalQuantity: 0, totalEvents: 0 },
      breakdown: [],
      timeseries: [],
      events: [],
    });
  }

  const { data, error } = await serviceClient
    .from('usage_events')
    .select(
      'id, event_date, metric_type, quantity, unit_price_cents, description, metadata, project_id, project:projects(name)',
    )
    .in('project_id', projectIds)
    .gte('event_date', dateRange.startDate)
    .lte('event_date', dateRange.endDate)
    .order('event_date', { ascending: false })
    .limit(MAX_EVENTS);

  if (error) {
    console.error('[client-portal usage] Failed to load usage events', error);
    return NextResponse.json({ error: 'Unable to load usage data.' }, { status: 500 });
  }

  const events = (data ?? []).map((event) => {
    const project = Array.isArray(event.project) ? event.project[0] : event.project;
    const quantity =
      typeof event.quantity === 'number' ? event.quantity : Number(event.quantity ?? 0);
    const unitPriceCents = Number(event.unit_price_cents ?? 0) || 0;
    return {
      id: event.id,
      eventDate: event.event_date,
      metricType: event.metric_type,
      quantity,
      unitPriceCents,
      description: event.description ?? null,
      metadata: event.metadata ?? null,
      projectId: event.project_id,
      projectName: project?.name ?? null,
      rawCostCents: Math.round(quantity * unitPriceCents),
    };
  });

  const breakdownMap = new Map<
    string,
    { metricType: string; totalQuantity: number; rawCostCents: number; events: number }
  >();
  const timeseriesMap = new Map<string, { totalCostCents: number; totalQuantity: number }>();

  let totalCostCents = 0;
  let totalQuantity = 0;

  for (const event of events) {
    totalCostCents += event.rawCostCents;
    totalQuantity += event.quantity;

    const metricKey =
      groupMode === 'project' && event.projectName
        ? event.projectName
        : event.metricType ?? 'usage';
    const existing = breakdownMap.get(metricKey) ?? {
      metricType: metricKey,
      totalQuantity: 0,
      rawCostCents: 0,
      events: 0,
    };
    existing.totalQuantity += event.quantity;
    existing.rawCostCents += event.rawCostCents;
    existing.events += 1;
    breakdownMap.set(metricKey, existing);

    const dayKey = event.eventDate ?? 'unknown';
    const dayEntry = timeseriesMap.get(dayKey) ?? { totalCostCents: 0, totalQuantity: 0 };
    dayEntry.totalCostCents += event.rawCostCents;
    dayEntry.totalQuantity += event.quantity;
    timeseriesMap.set(dayKey, dayEntry);
  }

  const breakdown = Array.from(breakdownMap.values()).sort(
    (a, b) => b.rawCostCents - a.rawCostCents,
  );
  const timeseries = Array.from(timeseriesMap.entries())
    .map(([date, value]) => ({ date, ...value }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  return NextResponse.json({
    summary: {
      totalCostCents,
      totalQuantity,
      totalEvents: events.length,
    },
    breakdown,
    timeseries,
    events,
  });
}



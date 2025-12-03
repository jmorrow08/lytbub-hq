import { supabase } from './supabaseClient';
import {
  getActiveTimezone,
  getDayKeyStartUtc,
  getMonthRangeUTC,
  getStartOfZonedDayUTC,
  getZonedDayKey,
} from './timezone';
import { addDays, addMonths } from 'date-fns';
import type {
  Task,
  Revenue,
  Content,
  Health,
  DashboardStats,
  CreateTaskData,
  UpdateTaskData,
  CreateRevenueData,
  UpdateRevenueData,
  CreateContentData,
  UpdateContentData,
  CreateHealthData,
  UpdateHealthData,
  Project,
  ProjectChannel,
  CreateProjectData,
  UpdateProjectData,
  CreateProjectChannelData,
  UpdateProjectChannelData,
  ProjectStats,
  DashboardProjectSummary,
  ProjectWithChannels,
  Payment,
  BillingPeriod,
  UsageEvent,
  Invoice,
  Client,
  ClientPortalUser,
  CreateClientData,
  UpdateClientData,
  PerformanceMetrics,
  FocusLog,
  FocusMode,
  PendingInvoiceItem,
  CreatePendingInvoiceItemInput,
  UpdatePendingInvoiceItemInput,
  QuickInvoiceResult,
} from '@/types';

type TaskQueryOptions = {
  projectId?: string;
  limit?: number;
  unassigned?: boolean;
};

type ContentQueryOptions = {
  projectId?: string;
  limit?: number;
  unassigned?: boolean;
};

const getCurrentUserId = async (): Promise<string | null> => {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch (error) {
    console.warn('Unable to resolve Supabase user session', error);
    return null;
  }
};

type AuthedRequestOptions = RequestInit & { isFormData?: boolean };

const authedRequest = async <T>(path: string, options: AuthedRequestOptions = {}): Promise<T> => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    throw new Error('You must be signed in to perform this action.');
  }

  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  const isFormData = options.isFormData || options.body instanceof FormData;
  if (!isFormData && options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });

  let payload: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (error) {
      console.warn('Unable to parse API response', error);
    }
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && payload !== null && 'error' in payload
        ? String((payload as { error?: string }).error || 'Request failed.')
        : 'Request failed.';
    throw new Error(message);
  }

  return (payload as T) ?? ({} as T);
};

const fetchHealthEntryForDay = (dayKey: string, userId: string | null) => {
  let query = supabase.from('health').select('*').eq('day_key', dayKey);
  if (userId) {
    query = query.eq('user_id', userId);
  }
  return query.maybeSingle();
};

// Tasks API
export const getTasks = async (options: TaskQueryOptions = {}): Promise<Task[]> => {
  const { projectId, limit = 5, unassigned } = options;
  const userId = await getCurrentUserId();
  if (!userId) return [];

  let query = supabase
    .from('tasks')
    .select('*, project:projects(*)')
    .eq('created_by', userId)
    .order('created_at', { ascending: false });

  if (unassigned) {
    query = query.is('project_id', null);
  } else if (projectId) {
    query = query.eq('project_id', projectId);
  }

  if (typeof limit === 'number') {
    query = query.limit(limit);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data || [];
};

export const createTask = async (task: CreateTaskData): Promise<Task> => {
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error('You must be signed in to create tasks.');
  }

  const payload = {
    ...task,
    project_id: task.project_id || null,
    focus_mode: task.focus_mode || 'CORPORATE',
    created_by: userId,
  };
  const { data, error } = await supabase.from('tasks').insert(payload).select().single();

  if (error) throw error;
  return data;
};

export const updateTask = async (id: string, updates: UpdateTaskData): Promise<Task> => {
  const payload: UpdateTaskData & { updated_at: string } = {
    ...updates,
    updated_at: new Date().toISOString(),
  };

  if (Object.prototype.hasOwnProperty.call(updates, 'project_id')) {
    payload.project_id = updates.project_id ?? null;
  }

  const { data, error } = await supabase
    .from('tasks')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const deleteTask = async (id: string): Promise<void> => {
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) throw error;
};

export const upsertPerformanceMetrics = async (
  taskId: string,
  payload: {
    financial_impact?: string | null;
    skill_demonstrated?: string | null;
    kudos_received?: string | null;
  },
): Promise<PerformanceMetrics> => {
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error('You must be signed in to add performance notes.');
  }

  const { data, error } = await supabase
    .from('performance_metrics')
    .upsert(
      {
        task_id: taskId,
        created_by: userId,
        financial_impact: payload.financial_impact || null,
        skill_demonstrated: payload.skill_demonstrated || null,
        kudos_received: payload.kudos_received || null,
      },
      { onConflict: 'task_id' },
    )
    .select()
    .single();

  if (error) throw error;
  return data as PerformanceMetrics;
};

export const createFocusLog = async (payload: {
  task_id?: string | null;
  mode: FocusMode;
  start_time?: string;
  end_time?: string;
  interruption_reason?: string | null;
  ai_summary?: string | null;
}): Promise<FocusLog> => {
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error('You must be signed in to log focus sessions.');
  }

  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from('focus_logs')
    .insert({
      user_id: userId,
      task_id: payload.task_id || null,
      mode: payload.mode,
      start_time: payload.start_time || nowIso,
      end_time: payload.end_time || payload.start_time || nowIso,
      interruption_reason: payload.interruption_reason || null,
      ai_summary: payload.ai_summary || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data as FocusLog;
};

// Revenue API
export const getRevenue = async (): Promise<Revenue[]> => {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from('revenue')
    .select('*')
    .eq('created_by', userId)
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) throw error;
  return data || [];
};

export const createRevenue = async (revenue: CreateRevenueData): Promise<Revenue> => {
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error('You must be signed in to create revenue entries.');
  }
  const { data, error } = await supabase
    .from('revenue')
    .insert({ ...revenue, created_by: userId })
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const updateRevenue = async (id: string, updates: UpdateRevenueData): Promise<Revenue> => {
  const { data, error } = await supabase
    .from('revenue')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const deleteRevenue = async (id: string): Promise<void> => {
  const { error } = await supabase.from('revenue').delete().eq('id', id);
  if (error) throw error;
};

// Content API
export const getContent = async (options: ContentQueryOptions = {}): Promise<Content[]> => {
  const { projectId, limit = 5, unassigned } = options;
  const userId = await getCurrentUserId();
  if (!userId) return [];

  let query = supabase
    .from('content')
    .select('*, project:projects(*)')
    .eq('created_by', userId)
    .order('created_at', { ascending: false });

  if (unassigned) {
    query = query.is('project_id', null);
  } else if (projectId) {
    query = query.eq('project_id', projectId);
  }

  if (typeof limit === 'number') {
    query = query.limit(limit);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data || [];
};

export const createContent = async (content: CreateContentData): Promise<Content> => {
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error('You must be signed in to create content.');
  }
  const payload = { ...content, project_id: content.project_id || null, created_by: userId };
  const { data, error } = await supabase.from('content').insert(payload).select().single();

  if (error) throw error;
  return data;
};

export const updateContent = async (id: string, updates: UpdateContentData): Promise<Content> => {
  const payload: UpdateContentData & { updated_at: string } = {
    ...updates,
    updated_at: new Date().toISOString(),
  };

  if (Object.prototype.hasOwnProperty.call(updates, 'project_id')) {
    payload.project_id = updates.project_id ?? null;
  }

  const { data, error } = await supabase
    .from('content')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as Content;
};

export const deleteContent = async (id: string): Promise<void> => {
  const { error } = await supabase.from('content').delete().eq('id', id);
  if (error) throw error;
};

// Health API
export const getHealth = async (): Promise<Health[]> => {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  let query = supabase
    .from('health')
    .select('*')
    .order('day_start_utc', { ascending: false, nullsFirst: false })
    .order('date', { ascending: false })
    .limit(5);

  query = query.eq('user_id', userId);

  const { data, error } = await query;

  if (error) throw error;
  return data || [];
};

export const getTodayHealth = async (): Promise<Health | null> => {
  const timezone = await getActiveTimezone(supabase);
  const userId = await getCurrentUserId();
  if (!userId) {
    return null;
  }
  const dayKey = getZonedDayKey(new Date(), timezone);

  const { data, error } = await fetchHealthEntryForDay(dayKey, userId);

  if (error) {
    console.error('Error fetching today health:', error);
    return null;
  }

  return (data as Health) ?? null;
};

export const createOrUpdateHealth = async (health: CreateHealthData): Promise<Health> => {
  const timezone = health.timezone || (await getActiveTimezone(supabase));
  const userId = health.user_id ?? (await getCurrentUserId());
  if (!userId) {
    throw new Error('You must be signed in to log health entries.');
  }
  const now = new Date();
  const dayKey = health.day_key || health.date || getZonedDayKey(now, timezone);

  const referenceDate = health.day_start_utc
    ? new Date(health.day_start_utc)
    : getDayKeyStartUtc(dayKey, timezone);

  const dayStartUtc = getStartOfZonedDayUTC(referenceDate, timezone).toISOString();

  const payload = {
    date: dayKey,
    day_key: dayKey,
    day_start_utc: dayStartUtc,
    timezone,
    user_id: userId,
    energy: health.energy,
    sleep_hours: health.sleep_hours,
    workout: Boolean(health.workout),
    notes: health.notes,
  };

  const matchFilters: Record<string, string> = { day_key: dayKey, user_id: userId };

  const existing = await supabase.from('health').select('id').match(matchFilters).maybeSingle();

  if (existing.data?.id) {
    const { data, error } = await supabase
      .from('health')
      .update({
        ...payload,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.data.id)
      .select()
      .single();

    if (error) throw error;
    return data as Health;
  }

  const { data, error } = await supabase.from('health').insert(payload).select().single();

  if (error) throw error;
  return data as Health;
};

export const updateHealth = async (id: string, updates: UpdateHealthData): Promise<Health> => {
  const { data, error } = await supabase
    .from('health')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as Health;
};

export const deleteHealth = async (id: string): Promise<void> => {
  const { error } = await supabase.from('health').delete().eq('id', id);
  if (error) throw error;
};

// Clients API
export const getClients = async (): Promise<Client[]> => {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('created_by', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data as Client[]) || [];
};

export const getClient = async (id: string): Promise<Client | null> => {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .eq('created_by', userId)
    .maybeSingle();

  if (error) throw error;
  return (data as Client | null) ?? null;
};

export const updateClientPortalSettings = async (
  clientId: string,
  updates: { portalEnabled?: boolean; notes?: string | null },
): Promise<Client> => {
  const data = await authedRequest<{ client: Client }>(`/api/admin/clients/${clientId}/portal`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  return data.client;
};

export const getClientPortalMembers = async (clientId: string): Promise<ClientPortalUser[]> => {
  const data = await authedRequest<{ members: ClientPortalUser[] }>(
    `/api/admin/clients/${clientId}/users`,
  );
  return data.members;
};

export const updateClientPortalMemberRole = async (
  clientId: string,
  membershipId: string,
  role: 'viewer' | 'admin',
): Promise<ClientPortalUser> => {
  const data = await authedRequest<{ member: ClientPortalUser }>(
    `/api/admin/clients/${clientId}/users/${membershipId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    },
  );
  return data.member;
};

export const removeClientPortalMember = async (
  clientId: string,
  membershipId: string,
): Promise<void> => {
  await authedRequest(`/api/admin/clients/${clientId}/users/${membershipId}`, {
    method: 'DELETE',
  });
};

export const createClient = async (payload: CreateClientData): Promise<Client> => {
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error('You must be signed in to create clients.');
  }

  const { data, error } = await supabase
    .from('clients')
    .insert({ ...payload, created_by: userId })
    .select()
    .single();

  if (error) throw error;
  return data as Client;
};

export const updateClient = async (id: string, payload: UpdateClientData): Promise<Client> => {
  const { data, error } = await supabase
    .from('clients')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as Client;
};

export const deleteClient = async (id: string): Promise<void> => {
  const { error } = await supabase.from('clients').delete().eq('id', id);
  if (error) throw error;
};

// Billing API
export const getBillingPeriods = async (
  options: { projectId?: string; clientId?: string } = {},
): Promise<BillingPeriod[]> => {
  const params = new URLSearchParams();
  if (options.projectId) params.set('projectId', options.projectId);
  if (options.clientId) params.set('clientId', options.clientId);
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const data = await authedRequest<{ periods: BillingPeriod[] }>(
    `/api/billing/billing-periods${suffix}`,
  );
  return data.periods ?? [];
};

export const createBillingPeriod = async (payload: {
  projectId: string;
  periodStart: string;
  periodEnd: string;
  notes?: string;
  clientId?: string;
}): Promise<BillingPeriod> => {
  const data = await authedRequest<{ period: BillingPeriod }>(`/api/billing/billing-periods`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data.period;
};

export const deleteBillingPeriod = async (billingPeriodId: string): Promise<void> => {
  await authedRequest(`/api/billing/billing-periods/${billingPeriodId}`, {
    method: 'DELETE',
  });
};

export const getUsageEvents = async (billingPeriodId: string): Promise<UsageEvent[]> => {
  const data = await authedRequest<{ events: UsageEvent[] }>(
    `/api/billing/usage-events?billingPeriodId=${encodeURIComponent(billingPeriodId)}`,
  );
  return data.events ?? [];
};

export const getPendingInvoiceItems = async (
  options: {
    projectId?: string;
    clientId?: string;
    status?: 'pending' | 'billed' | 'voided' | 'all';
    limit?: number;
  } = {},
): Promise<PendingInvoiceItem[]> => {
  const params = new URLSearchParams();
  if (options.projectId) params.set('projectId', options.projectId);
  if (options.clientId) params.set('clientId', options.clientId);
  if (options.status) params.set('status', options.status);
  if (typeof options.limit === 'number') params.set('limit', String(options.limit));
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const data = await authedRequest<{ items: PendingInvoiceItem[] }>(
    `/api/billing/pending-items${suffix}`,
  );
  return data.items ?? [];
};

export const createPendingInvoiceItems = async (
  payload: CreatePendingInvoiceItemInput | CreatePendingInvoiceItemInput[],
): Promise<PendingInvoiceItem[]> => {
  const body = Array.isArray(payload) ? { items: payload } : payload;
  const data = await authedRequest<{ items: PendingInvoiceItem[] }>('/api/billing/pending-items', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return data.items ?? [];
};

export const updatePendingInvoiceItem = async (
  itemId: string,
  updates: UpdatePendingInvoiceItemInput,
): Promise<PendingInvoiceItem> => {
  const data = await authedRequest<{ item: PendingInvoiceItem }>(
    `/api/billing/pending-items/${itemId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(updates),
    },
  );
  return data.item;
};

export const deletePendingInvoiceItem = async (itemId: string): Promise<void> => {
  await authedRequest(`/api/billing/pending-items/${itemId}`, {
    method: 'DELETE',
  });
};

export const importUsageCsv = async (params: {
  projectId: string;
  billingPeriodId: string;
  file: File;
}): Promise<{ imported: number; warnings?: string[]; pendingItem?: PendingInvoiceItem }> => {
  const formData = new FormData();
  formData.append('projectId', params.projectId);
  formData.append('billingPeriodId', params.billingPeriodId);
  formData.append('file', params.file);

  const data = await authedRequest<{
    imported: number;
    warnings?: string[];
    pendingItem?: PendingInvoiceItem;
  }>('/api/billing/import-usage', {
    method: 'POST',
    body: formData,
    isFormData: true,
  });
  return data;
};

export const uploadShadowBreakdown = async (params: {
  invoiceId: string;
  file: File;
  apply?: boolean;
}): Promise<{
  shadowItems: Array<{
    label: string;
    description?: string;
    hours?: number;
    marketRatePerHour?: number;
    impliedValue?: number;
    isComplimentary?: boolean;
  }>;
  shadowSummary?: {
    totalImpliedValue?: number;
    complimentaryValue?: number;
    note?: string;
    retainerCurrentCents?: number;
    retainerNormalCents?: number;
    retainerIncludes?: string[];
  };
  warnings?: string[];
  applied?: boolean;
  portalPayload?: Record<string, unknown>;
}> => {
  const formData = new FormData();
  formData.append('invoiceId', params.invoiceId);
  formData.append('file', params.file);
  if (params.apply) formData.append('apply', 'true');

  const data = await authedRequest('/api/billing/shadow-import', {
    method: 'POST',
    body: formData,
    isFormData: true,
  });
  return data as any;
};

export const createQuickInvoice = async (payload: {
  projectId: string;
  pendingItemIds: string[];
  includeRetainer?: boolean;
  collectionMethod?: 'auto' | 'charge_automatically' | 'send_invoice';
  dueDate?: string;
  memo?: string;
  clientId?: string;
  finalize?: boolean;
}): Promise<QuickInvoiceResult> => {
  const data = await authedRequest<QuickInvoiceResult>('/api/billing/quick-invoice', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data;
};

export const getInvoices = async (
  options: { projectId?: string; clientId?: string } = {},
): Promise<Invoice[]> => {
  const params = new URLSearchParams();
  if (options.projectId) params.set('projectId', options.projectId);
  if (options.clientId) params.set('clientId', options.clientId);
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const data = await authedRequest<{ invoices: Invoice[] }>(`/api/billing/invoices${suffix}`);
  return data.invoices ?? [];
};

export const getInvoice = async (invoiceId: string): Promise<Invoice> => {
  const data = await authedRequest<{ invoice: Invoice }>(`/api/billing/invoices/${invoiceId}`);
  return data.invoice;
};

export const createDraftInvoice = async (payload: {
  billingPeriodId: string;
  includeProcessingFee?: boolean;
  includeRetainer?: boolean;
  memo?: string;
  manualLines?: Array<{ description: string; quantity?: number; unitPriceCents: number }>;
  collectionMethod?: 'charge_automatically' | 'send_invoice';
  dueDate?: string; // YYYY-MM-DD
  pendingItemIds?: string[];
}): Promise<Invoice> => {
  const data = await authedRequest<{ invoice: Invoice }>(`/api/billing/invoices/draft`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data.invoice;
};

export const finalizeInvoice = async (invoiceId: string): Promise<Invoice> => {
  const data = await authedRequest<{ invoice: Invoice }>(
    `/api/billing/invoices/${invoiceId}/finalize`,
    { method: 'POST' },
  );
  return data.invoice;
};

export const markInvoicePaidOffline = async (
  invoiceId: string,
  payload: { amountCents?: number; notes?: string } = {},
): Promise<Invoice> => {
  const data = await authedRequest<{ invoice: Invoice }>(
    `/api/billing/invoices/${invoiceId}/mark-paid-offline`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
  return data.invoice;
};

export const addDraftInvoiceLineItem = async (
  invoiceId: string,
  payload: { description: string; quantity?: number; unitPriceCents: number },
): Promise<Invoice> => {
  const data = await authedRequest<{ invoice: Invoice }>(
    `/api/billing/invoices/${invoiceId}/add-line-item`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
  return data.invoice;
};

export const deleteDraftInvoice = async (invoiceId: string): Promise<void> => {
  await authedRequest(`/api/billing/invoices/${invoiceId}/delete`, {
    method: 'DELETE',
  });
};

export const deleteInvoice = deleteDraftInvoice;

export const updateInvoicePortal = async (
  invoiceId: string,
  payload: {
    portalPayload?: Record<string, unknown>;
    regenerateShareId?: boolean;
    expiresAt?: string | null;
  },
): Promise<Invoice> => {
  const data = await authedRequest<{ invoice: Invoice }>(
    `/api/billing/invoices/${invoiceId}/portal`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  );
  return data.invoice;
};

export const createBillingPortalLink = async (
  projectId: string,
  returnUrl?: string,
): Promise<{ url: string }> => {
  const data = await authedRequest<{ url: string }>(`/api/billing/portal`, {
    method: 'POST',
    body: JSON.stringify({ projectId, returnUrl }),
  });
  return data;
};

export const updateSubscriptionSettings = async (payload: {
  projectId: string;
  subscriptionEnabled?: boolean;
  baseRetainerCents?: number | null;
  autoPayEnabled?: boolean;
  paymentMethodType?: 'card' | 'ach' | 'offline';
  achDiscountCents?: number;
  notifyUsageEvents?: boolean;
}): Promise<Project> => {
  const data = await authedRequest<{ project: Project }>(`/api/billing/subscriptions`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return data.project;
};

// Dashboard Stats API
export const getDashboardStats = async (): Promise<DashboardStats> => {
  const timezone = await getActiveTimezone(supabase);
  const userId = await getCurrentUserId();
  const now = new Date();
  const dayKey = getZonedDayKey(now, timezone);
  const todayStartUtc = getStartOfZonedDayUTC(now, timezone);
  const baseStats: DashboardStats = {
    totalTasks: 0,
    completedTasks: 0,
    totalRevenue: 0,
    todayRevenue: 0,
    totalContent: 0,
    totalViews: 0,
    projectSummaries: [],
    activeTimezone: timezone,
  };

  if (!userId) {
    return baseStats;
  }

  const tomorrowStartUtc = addDays(todayStartUtc, 1);
  const currentMonthRange = getMonthRangeUTC(now, timezone);
  const previousMonthRange = getMonthRangeUTC(addMonths(now, -1), timezone);

  const [tasks, revenue, content, projects, projectStats, todayHealthResponse] = await Promise.all([
    supabase.from('tasks').select('completed, project_id').eq('created_by', userId),
    supabase.from('revenue').select('amount, created_at').eq('created_by', userId),
    supabase.from('content').select('views, project_id').eq('created_by', userId),
    supabase.from('projects').select('*').eq('created_by', userId),
    supabase.from('project_stats').select('*'),
    fetchHealthEntryForDay(dayKey, userId),
  ]);

  if (tasks.error) throw tasks.error;
  if (revenue.error) throw revenue.error;
  if (content.error) throw content.error;
  if (projects.error) throw projects.error;
  if (projectStats.error) throw projectStats.error;

  const totalTasks = tasks.data?.length || 0;
  const completedTasks = tasks.data?.filter((t) => t.completed).length || 0;
  const totalRevenue = revenue.data?.reduce((sum, r) => sum + r.amount, 0) || 0;

  const revenueRows = revenue.data || [];
  const todayRevenue = revenueRows
    .filter((r) => {
      const createdAt = new Date(r.created_at);
      return createdAt >= todayStartUtc && createdAt < tomorrowStartUtc;
    })
    .reduce((sum, r) => sum + r.amount, 0);

  const currentMonthRevenue = revenueRows
    .filter((r) => {
      const createdAt = new Date(r.created_at);
      return createdAt >= currentMonthRange.startUtc && createdAt < currentMonthRange.endUtc;
    })
    .reduce((sum, r) => sum + r.amount, 0);

  const previousMonthRevenue = revenueRows
    .filter((r) => {
      const createdAt = new Date(r.created_at);
      return createdAt >= previousMonthRange.startUtc && createdAt < previousMonthRange.endUtc;
    })
    .reduce((sum, r) => sum + r.amount, 0);

  const totalContent = content.data?.length || 0;
  const totalViews = content.data?.reduce((sum, c) => sum + c.views, 0) || 0;

  const projectSummaries: DashboardProjectSummary[] =
    projectStats.data
      ?.map((stat) => {
        const project = projects.data?.find((p) => p.id === stat.project_id);
        if (!project) return null;
        return {
          project,
          openTasks: stat.open_tasks || 0,
          completedTasks: stat.completed_tasks || 0,
          contentCount: stat.content_count || 0,
          totalViews: stat.total_views || 0,
          lastPublishedAt: stat.last_published_at || null,
        } as DashboardProjectSummary;
      })
      .filter((summary): summary is DashboardProjectSummary => Boolean(summary))
      .sort((a, b) => b.totalViews - a.totalViews)
      .slice(0, 4) || [];

  if (todayHealthResponse.error) {
    console.error('Dashboard health fetch error:', todayHealthResponse.error);
  }

  return {
    ...baseStats,
    totalTasks,
    completedTasks,
    totalRevenue,
    todayRevenue,
    currentMonthRevenue,
    previousMonthRevenue,
    totalContent,
    totalViews,
    todayHealth: (todayHealthResponse.data as Health | null) || undefined,
    projectSummaries,
  };
};

// Projects API
export const getProjects = async (): Promise<ProjectWithChannels[]> => {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from('projects')
    .select('*, channels:project_channels(*), client:clients(*)')
    .eq('created_by', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data as ProjectWithChannels[]) || [];
};

export const getProject = async (id: string): Promise<ProjectWithChannels> => {
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error('You must be signed in to access projects.');
  }

  const { data, error } = await supabase
    .from('projects')
    .select('*, channels:project_channels(*), client:clients(*)')
    .eq('id', id)
    .eq('created_by', userId)
    .single();

  if (error) throw error;
  return data as ProjectWithChannels;
};

export const createProject = async (payload: CreateProjectData): Promise<Project> => {
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error('You must be signed in to create projects.');
  }

  const projectPayload = {
    ...payload,
    client_id: payload.client_id ?? null,
    created_by: userId,
  };

  const { data, error } = await supabase.from('projects').insert(projectPayload).select().single();
  if (error) throw error;
  return data as Project;
};

export const updateProject = async (id: string, payload: UpdateProjectData): Promise<Project> => {
  const updatePayload: UpdateProjectData & { updated_at: string } = {
    ...payload,
    updated_at: new Date().toISOString(),
  };

  if (Object.prototype.hasOwnProperty.call(payload, 'client_id')) {
    updatePayload.client_id = payload.client_id ?? null;
  }

  const { data, error } = await supabase
    .from('projects')
    .update(updatePayload)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as Project;
};

export const deleteProject = async (id: string): Promise<void> => {
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) throw error;
};

export const getProjectStats = async (): Promise<ProjectStats[]> => {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const { data, error } = await supabase.from('project_stats').select('*');
  if (error) throw error;
  return (data as ProjectStats[]) || [];
};

export const createProjectChannel = async (
  payload: CreateProjectChannelData,
): Promise<ProjectChannel> => {
  const { data, error } = await supabase.from('project_channels').insert(payload).select().single();

  if (error) throw error;
  return data as ProjectChannel;
};

export const updateProjectChannel = async (
  id: string,
  payload: UpdateProjectChannelData,
): Promise<ProjectChannel> => {
  const { data, error } = await supabase
    .from('project_channels')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as ProjectChannel;
};

export const deleteProjectChannel = async (id: string): Promise<void> => {
  const { error } = await supabase.from('project_channels').delete().eq('id', id);
  if (error) throw error;
};

// Finance API
export const getClientProjects = async (): Promise<Project[]> => {
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error('Authentication is required to access client projects.');
  }

  const { data, error } = await supabase
    .from('projects')
    .select('*, client:clients(*)')
    .not('client_id', 'is', null)
    .eq('created_by', userId)
    .order('name', { ascending: true });

  if (error) throw error;
  return (data as Project[]) || [];
};

export const getPayments = async (
  options: { clientId?: string; projectId?: string } = {},
): Promise<Payment[]> => {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  let query = supabase
    .from('payments')
    .select('*, project:projects(*), client:clients(*)')
    .eq('created_by', userId)
    .order('created_at', { ascending: false })
    .limit(25);

  if (options.clientId) {
    query = query.eq('client_id', options.clientId);
  }
  if (options.projectId) {
    query = query.eq('project_id', options.projectId);
  }

  const { data, error } = await query;

  if (error) throw error;
  return (data as Payment[]) || [];
};

export const deletePayment = async (id: string): Promise<void> => {
  const { error } = await supabase.from('payments').delete().eq('id', id);
  if (error) throw error;
};

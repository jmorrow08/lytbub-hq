import { supabase } from './supabaseClient';
import type {
  Task,
  Revenue,
  Content,
  Health,
  DashboardStats,
  CreateTaskData,
  UpdateTaskData,
  CreateRevenueData,
  CreateContentData,
  CreateHealthData,
  UpdateHealthData,
} from '@/types';

// Tasks API
export const getTasks = async (): Promise<Task[]> => {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) throw error;
  return data || [];
};

export const createTask = async (task: CreateTaskData): Promise<Task> => {
  const { data, error } = await supabase.from('tasks').insert(task).select().single();

  if (error) throw error;
  return data;
};

export const updateTask = async (id: string, updates: UpdateTaskData): Promise<Task> => {
  const { data, error } = await supabase
    .from('tasks')
    .update({ ...updates, updated_at: new Date().toISOString() })
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

// Revenue API
export const getRevenue = async (): Promise<Revenue[]> => {
  const { data, error } = await supabase
    .from('revenue')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) throw error;
  return data || [];
};

export const createRevenue = async (revenue: CreateRevenueData): Promise<Revenue> => {
  const { data, error } = await supabase.from('revenue').insert(revenue).select().single();

  if (error) throw error;
  return data;
};

// Content API
export const getContent = async (): Promise<Content[]> => {
  const { data, error } = await supabase
    .from('content')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) throw error;
  return data || [];
};

export const createContent = async (content: CreateContentData): Promise<Content> => {
  const { data, error } = await supabase.from('content').insert(content).select().single();

  if (error) throw error;
  return data;
};

// Health API
export const getHealth = async (): Promise<Health[]> => {
  const { data, error } = await supabase
    .from('health')
    .select('*')
    .order('date', { ascending: false })
    .limit(5);

  if (error) throw error;
  return data || [];
};

export const getTodayHealth = async (): Promise<Health | null> => {
  // Use local date to match the database date column and avoid UTC boundary issues
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .split('T')[0];

  const { data, error } = await supabase
    .from('health')
    .select('*')
    .eq('date', localDate)
    .maybeSingle(); // Avoids 406 when no rows

  if (error) {
    console.error('Error fetching today health:', error);
    return null;
  }
  return (data as Health) ?? null;
};

export const createOrUpdateHealth = async (health: CreateHealthData): Promise<Health> => {
  const payload = { ...health, updated_at: new Date().toISOString() };
  // First, try to use upsert when a unique(date) constraint exists
  try {
    const { data, error } = await supabase
      .from('health')
      .upsert(payload, { onConflict: 'date', ignoreDuplicates: false })
      .select()
      .single();

    if (error) throw error;
    return data as Health;
  } catch (err: any) {
    // Fallback path when ON CONFLICT target doesn't exist in DB yet
    // Try update-by-date, then insert if no row was updated
    const updateAttempt = await supabase
      .from('health')
      .update(payload)
      .eq('date', health.date)
      .select()
      .maybeSingle();

    if (!updateAttempt.error && updateAttempt.data) {
      return updateAttempt.data as Health;
    }

    const { data: inserted, error: insertError } = await supabase
      .from('health')
      .insert(health)
      .select()
      .single();

    if (insertError) throw insertError;
    return inserted as Health;
  }
};

// Dashboard Stats API
export const getDashboardStats = async (): Promise<DashboardStats> => {
  const [tasks, revenue, content, todayHealth] = await Promise.all([
    supabase.from('tasks').select('completed'),
    supabase.from('revenue').select('amount, created_at'),
    supabase.from('content').select('views'),
    getTodayHealth(),
  ]);

  if (tasks.error) throw tasks.error;
  if (revenue.error) throw revenue.error;
  if (content.error) throw content.error;

  const totalTasks = tasks.data?.length || 0;
  const completedTasks = tasks.data?.filter((t) => t.completed).length || 0;
  const totalRevenue = revenue.data?.reduce((sum, r) => sum + r.amount, 0) || 0;

  // Calculate today's revenue
  const today = new Date().toISOString().split('T')[0];
  const todayRevenue =
    revenue.data
      ?.filter((r) => r.created_at.startsWith(today))
      .reduce((sum, r) => sum + r.amount, 0) || 0;

  const totalContent = content.data?.length || 0;
  const totalViews = content.data?.reduce((sum, c) => sum + c.views, 0) || 0;

  return {
    totalTasks,
    completedTasks,
    totalRevenue,
    todayRevenue,
    totalContent,
    totalViews,
    todayHealth: todayHealth || undefined,
  };
};

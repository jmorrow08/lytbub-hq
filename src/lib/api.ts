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
  const { data, error } = await supabase
    .from('tasks')
    .insert(task)
    .select()
    .single();

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
  const { data, error } = await supabase
    .from('revenue')
    .insert(revenue)
    .select()
    .single();

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
  const { data, error } = await supabase
    .from('content')
    .insert(content)
    .select()
    .single();

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
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('health')
    .select('*')
    .eq('date', today)
    .single();

  if (error && error.code !== 'PGRST116') throw error; // PGRST116 is "not found"
  return data;
};

export const createOrUpdateHealth = async (health: CreateHealthData): Promise<Health> => {
  const { data, error } = await supabase
    .from('health')
    .upsert(health, { onConflict: 'date' })
    .select()
    .single();

  if (error) throw error;
  return data;
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
  const completedTasks = tasks.data?.filter(t => t.completed).length || 0;
  const totalRevenue = revenue.data?.reduce((sum, r) => sum + r.amount, 0) || 0;

  // Calculate today's revenue
  const today = new Date().toISOString().split('T')[0];
  const todayRevenue = revenue.data
    ?.filter(r => r.created_at.startsWith(today))
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

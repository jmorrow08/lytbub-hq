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

// Tasks API
export const getTasks = async (options: TaskQueryOptions = {}): Promise<Task[]> => {
  const { projectId, limit = 5, unassigned } = options;

  let query = supabase
    .from('tasks')
    .select('*, project:projects(*)')
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
  const payload = { ...task, project_id: task.project_id || null };
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

  let query = supabase
    .from('content')
    .select('*, project:projects(*)')
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
  const payload = { ...content, project_id: content.project_id || null };
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
  } catch {
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

// Dashboard Stats API
export const getDashboardStats = async (): Promise<DashboardStats> => {
  const [tasks, revenue, content, todayHealth, projects, projectStats] = await Promise.all([
    supabase.from('tasks').select('completed, project_id'),
    supabase.from('revenue').select('amount, created_at'),
    supabase.from('content').select('views, project_id'),
    getTodayHealth(),
    supabase.from('projects').select('*'),
    supabase.from('project_stats').select('*'),
  ]);

  if (tasks.error) throw tasks.error;
  if (revenue.error) throw revenue.error;
  if (content.error) throw content.error;
  if (projects.error) throw projects.error;
  if (projectStats.error) throw projectStats.error;

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

  return {
    totalTasks,
    completedTasks,
    totalRevenue,
    todayRevenue,
    totalContent,
    totalViews,
    todayHealth: todayHealth || undefined,
    projectSummaries,
  };
};

// Projects API
export const getProjects = async (): Promise<ProjectWithChannels[]> => {
  const { data, error } = await supabase
    .from('projects')
    .select('*, channels:project_channels(*)')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data as ProjectWithChannels[]) || [];
};

export const getProject = async (id: string): Promise<ProjectWithChannels> => {
  const { data, error } = await supabase
    .from('projects')
    .select('*, channels:project_channels(*)')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data as ProjectWithChannels;
};

export const createProject = async (payload: CreateProjectData): Promise<Project> => {
  const { data, error } = await supabase.from('projects').insert(payload).select().single();
  if (error) throw error;
  return data as Project;
};

export const updateProject = async (id: string, payload: UpdateProjectData): Promise<Project> => {
  const { data, error } = await supabase
    .from('projects')
    .update({ ...payload, updated_at: new Date().toISOString() })
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
  const { data, error } = await supabase.from('project_stats').select('*');
  if (error) throw error;
  return (data as ProjectStats[]) || [];
};

export const createProjectChannel = async (
  payload: CreateProjectChannelData
): Promise<ProjectChannel> => {
  const { data, error } = await supabase.from('project_channels').insert(payload).select().single();

  if (error) throw error;
  return data as ProjectChannel;
};

export const updateProjectChannel = async (
  id: string,
  payload: UpdateProjectChannelData
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

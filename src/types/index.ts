export interface Project {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  type: 'content_engine' | 'client' | 'internal' | 'experiment';
  status: 'active' | 'paused' | 'completed';
  color?: string | null;
  default_platform?: string | null;
  default_handle?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectChannel {
  id: string;
  project_id: string;
  platform: 'youtube' | 'instagram' | 'tiktok' | 'twitter' | 'linkedin' | 'website' | 'podcast' | 'newsletter' | 'other';
  handle?: string | null;
  url?: string | null;
  is_primary: boolean;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export type ProjectWithChannels = Project & { channels?: ProjectChannel[] | null };

export interface ProjectStats {
  project_id: string;
  open_tasks: number;
  completed_tasks: number;
  content_count: number;
  total_views: number;
  last_published_at?: string | null;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  created_at: string;
  updated_at: string;
  project_id?: string | null;
  project?: Project | null;
}

export interface Revenue {
  id: string;
  source: string;
  amount: number;
  description?: string;
  created_at: string;
}

export interface Content {
  id: string;
  title: string;
  platform: string;
  views: number;
  url?: string;
  published_at?: string;
  created_at: string;
  updated_at: string;
  project_id?: string | null;
  project?: Project | null;
}

export interface Health {
  id: string;
  date: string;
  energy?: number;
  sleep_hours?: number;
  workout: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface DashboardStats {
  totalTasks: number;
  completedTasks: number;
  totalRevenue: number;
  todayRevenue: number;
  totalContent: number;
  totalViews: number;
  todayHealth?: Health;
  projectSummaries?: DashboardProjectSummary[];
}

export interface DashboardProjectSummary {
  project: Project;
  openTasks: number;
  contentCount: number;
  totalViews: number;
  completedTasks: number;
  lastPublishedAt?: string | null;
}

export interface CreateTaskData {
  title: string;
  description?: string;
  project_id?: string | null;
}

export interface UpdateTaskData {
  title?: string;
  description?: string;
  completed?: boolean;
  project_id?: string | null;
}

export interface CreateRevenueData {
  source: string;
  amount: number;
  description?: string;
}

export interface UpdateRevenueData {
  source?: string;
  amount?: number;
  description?: string;
}

export interface CreateContentData {
  title: string;
  platform: string;
  views?: number;
  url?: string;
  published_at?: string;
  project_id?: string | null;
}

export interface UpdateContentData {
  title?: string;
  platform?: string;
  views?: number;
  url?: string | null;
  published_at?: string | null;
  project_id?: string | null;
}

export interface CreateHealthData {
  date: string;
  energy?: number;
  sleep_hours?: number;
  workout: boolean;
  notes?: string;
}

export interface UpdateHealthData {
  energy?: number;
  sleep_hours?: number;
  workout?: boolean;
  notes?: string;
}

export interface CreateProjectData {
  name: string;
  slug: string;
  description?: string;
  type?: Project['type'];
  status?: Project['status'];
  color?: string;
  default_platform?: string;
  default_handle?: string;
  notes?: string;
}

export type UpdateProjectData = Partial<CreateProjectData>;

export interface CreateProjectChannelData {
  project_id: string;
  platform: ProjectChannel['platform'];
  handle?: string;
  url?: string;
  is_primary?: boolean;
  notes?: string;
}

export type UpdateProjectChannelData = Partial<CreateProjectChannelData>;

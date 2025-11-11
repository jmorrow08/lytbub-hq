export interface Task {
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  created_at: string;
  updated_at: string;
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
}

export interface CreateTaskData {
  title: string;
  description?: string;
}

export interface UpdateTaskData {
  title?: string;
  description?: string;
  completed?: boolean;
}

export interface CreateRevenueData {
  source: string;
  amount: number;
  description?: string;
}

export interface CreateContentData {
  title: string;
  platform: string;
  views?: number;
  url?: string;
  published_at?: string;
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

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
  client_id?: string | null;
  client?: Client | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  subscription_enabled?: boolean;
  base_retainer_cents?: number | null;
  auto_pay_enabled?: boolean;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  payment_method_type?: 'card' | 'ach' | 'offline';
  ach_discount_cents?: number | null;
  billing_anchor_day?: number | null;
  billing_auto_finalize?: boolean;
  billing_default_collection_method?: 'charge_automatically' | 'send_invoice';
  notify_usage_events?: boolean;
}

export type FocusMode = 'CORPORATE' | 'HOLISTIC';
export type AppMode = 'LYTBUB_HQ' | 'FOCUS_PRO';

export interface ProjectChannel {
  id: string;
  project_id: string;
  platform:
    | 'youtube'
    | 'instagram'
    | 'tiktok'
    | 'twitter'
    | 'linkedin'
    | 'website'
    | 'podcast'
    | 'newsletter'
    | 'other';
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

export interface Payment {
  id: string;
  created_by: string;
  project_id?: string | null;
  project?: Project | null;
  client_id?: string | null;
  client?: Client | null;
  amount_cents: number;
  currency: string;
  description?: string | null;
  link_type: 'checkout_session' | 'payment_link';
  stripe_id?: string | null;
  url: string;
  status?: string | null;
  payment_method_used?: string | null;
  payment_brand?: string | null;
  payment_last4?: string | null;
  created_at: string;
}

export interface CheckoutSessionResponse {
  url: string;
  paymentId: string;
}

export interface CheckoutMetadata {
  clientId: string;
  clientName: string;
}

export type BillingPeriodStatus = 'draft' | 'finalized' | 'paid';
export type InvoiceStatus = 'draft' | 'open' | 'paid' | 'void';
export type InvoiceLineType = 'base_subscription' | 'usage' | 'project' | 'processing_fee';

export interface BillingPeriod {
  id: string;
  project_id: string;
  client_id?: string | null;
  period_start: string;
  period_end: string;
  status: BillingPeriodStatus;
  notes?: string | null;
  created_by: string;
  created_at: string;
  updated_at?: string;
}

export interface UsageEvent {
  id: string;
  project_id: string;
  billing_period_id?: string | null;
  event_date: string;
  metric_type: string;
  quantity: number;
  unit_price_cents: number;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  created_by: string;
  created_at: string;
}

export interface InvoiceLineItem {
  id: string;
  invoice_id: string;
  line_type: InvoiceLineType;
  description: string;
  quantity: number;
  unit_price_cents: number;
  amount_cents: number;
  sort_order?: number;
  metadata?: Record<string, unknown> | null;
  created_by: string;
  created_at: string;
  pending_source_item_id?: string | null;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  project_id: string;
  client_id?: string | null;
  billing_period_id?: string | null;
  stripe_invoice_id?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  subtotal_cents: number;
  tax_cents: number;
  processing_fee_cents: number;
  total_cents: number;
  net_amount_cents: number;
  payment_method_type: 'card' | 'ach' | 'offline';
  collection_method?: 'charge_automatically' | 'send_invoice';
  due_date?: string | null;
  status: InvoiceStatus;
  stripe_hosted_url?: string | null;
  stripe_pdf_url?: string | null;
  payment_method_used?: string | null;
  payment_brand?: string | null;
  payment_last4?: string | null;
  metadata?: Record<string, unknown> | null;
  public_share_id?: string | null;
  public_share_expires_at?: string | null;
  portal_payload?: Record<string, unknown> | null;
  created_by: string;
  created_at: string;
  updated_at?: string | null;
  client?: Client | null;
  line_items?: InvoiceLineItem[];
}

export type PendingInvoiceSourceType = 'usage' | 'task' | 'manual';
export type PendingInvoiceStatus = 'pending' | 'billed' | 'voided';

export interface PendingInvoiceItem {
  id: string;
  created_by: string;
  project_id: string;
  client_id?: string | null;
  source_type: PendingInvoiceSourceType;
  source_ref_id?: string | null;
  description: string;
  quantity: number;
  unit_price_cents: number;
  amount_cents: number;
  status: PendingInvoiceStatus;
  billed_invoice_id?: string | null;
  billed_invoice_line_item_id?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  project?: Project | null;
  client?: Client | null;
}

export interface CreatePendingInvoiceItemInput {
  projectId: string;
  clientId?: string;
  sourceType?: PendingInvoiceSourceType;
  sourceRefId?: string;
  description: string;
  quantity?: number;
  unitPriceCents: number;
  metadata?: Record<string, unknown>;
}

export interface UpdatePendingInvoiceItemInput {
  description?: string;
  quantity?: number;
  unitPriceCents?: number;
  status?: PendingInvoiceStatus;
  metadata?: Record<string, unknown> | null;
  clientId?: string | null;
}

export interface QuickInvoiceResult {
  invoice: Invoice;
  pendingItemIds: string[];
  needsPaymentMethod: boolean;
  stripe?: Record<string, unknown>;
}

export interface Client {
  id: string;
  name: string;
  company_name?: string | null;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  stripe_customer_id?: string | null;
  client_portal_enabled?: boolean | null;
  client_portal_last_access?: string | null;
  client_portal_notes?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface ClientPortalUser {
  id: string;
  client_id: string;
  user_id: string;
  email: string;
  role: 'owner' | 'viewer' | 'admin';
  created_at: string;
}

export interface Task {
  id: string;
  created_by: string;
  title: string;
  description?: string;
  completed: boolean;
  created_at: string;
  updated_at: string;
  project_id?: string | null;
  project?: Project | null;
  focus_mode?: FocusMode;
  performance_metrics?: PerformanceMetrics | null;
}

export interface Revenue {
  id: string;
  created_by: string;
  source: string;
  amount: number;
  description?: string;
  created_at: string;
}

export interface Content {
  id: string;
  created_by: string;
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
  day_key: string;
  day_start_utc?: string | null;
  timezone: string;
  user_id?: string | null;
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
  currentMonthRevenue?: number;
  previousMonthRevenue?: number;
  totalContent: number;
  totalViews: number;
  todayHealth?: Health;
  projectSummaries?: DashboardProjectSummary[];
  activeTimezone?: string;
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
  focus_mode?: FocusMode;
}

export interface UpdateTaskData {
  title?: string;
  description?: string;
  completed?: boolean;
  project_id?: string | null;
  focus_mode?: FocusMode;
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
  date?: string;
  day_key?: string;
  day_start_utc?: string;
  timezone?: string;
  user_id?: string | null;
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
  date?: string;
  day_key?: string;
  day_start_utc?: string;
  timezone?: string;
  user_id?: string | null;
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
  client_id?: string | null;
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

export interface CreateClientData {
  name: string;
  company_name?: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  notes?: string;
}

export type UpdateClientData = Partial<CreateClientData>;

export interface PerformanceMetrics {
  id: string;
  task_id: string;
  financial_impact?: string | null;
  skill_demonstrated?: string | null;
  kudos_received?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface FocusLog {
  id: string;
  user_id: string;
  task_id?: string | null;
  mode: FocusMode;
  start_time: string;
  end_time?: string | null;
  interruption_reason?: string | null;
  ai_summary?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProfileSettings {
  user_id: string;
  timezone: string;
  tz_last_seen_at?: string;
  app_mode: AppMode;
}

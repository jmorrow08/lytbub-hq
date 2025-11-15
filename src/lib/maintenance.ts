import { supabase } from '@/lib/supabaseClient';

const PROJECTS_BACKFILL_KEY = 'finance_backfill_projects_v1';

/**
 * Runs idempotent finance backfills for the current user.
 * Currently: sets projects.created_by for legacy rows where it is NULL.
 * Guarded by localStorage so it only runs once per browser.
 */
export async function runFinanceBackfills(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    if (localStorage.getItem(PROJECTS_BACKFILL_KEY)) {
      return;
    }

    const { error } = await supabase.rpc('backfill_projects_created_by');
    if (error) {
      console.warn('Backfill projects ownership failed:', error);
      // Do not set the guard so we can retry on next visit
      return;
    }

    localStorage.setItem(PROJECTS_BACKFILL_KEY, 'done');
  } catch (err) {
    console.warn('Backfill runtime error:', err);
  }
}



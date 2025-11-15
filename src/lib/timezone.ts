import { SupabaseClient } from '@supabase/supabase-js';
import { addMonths, startOfDay, startOfMonth, format } from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';

const DEFAULT_TIMEZONE = 'America/New_York';

const getBrowserTimezone = (): string | undefined => {
  if (typeof window === 'undefined') return undefined;
  if (typeof Intl === 'undefined' || typeof Intl.DateTimeFormat === 'undefined') return undefined;
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
};

export async function getActiveTimezone(client: SupabaseClient): Promise<string> {
  const fallbackTz = getBrowserTimezone() || DEFAULT_TIMEZONE;

  try {
    const { data: sessionData } = await client.auth.getSession();
    const userId = sessionData.session?.user?.id;

    if (!userId) {
      return fallbackTz;
    }

    const { data, error } = await client
      .from('profile_settings')
      .select('timezone')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.warn('Failed to load profile timezone', error);
      return fallbackTz;
    }

    if (data?.timezone) {
      await client
        .from('profile_settings')
        .update({ tz_last_seen_at: new Date().toISOString() })
        .eq('user_id', userId);
      return data.timezone;
    }

    await client.from('profile_settings').upsert(
      {
        user_id: userId,
        timezone: fallbackTz,
        tz_last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

    return fallbackTz;
  } catch (error) {
    console.warn('Failed to resolve active timezone', error);
    return fallbackTz;
  }
}

export function getZonedDayKey(date: Date, timezone: string): string {
  const zoned = toZonedTime(date, timezone);
  return format(zoned, 'yyyy-MM-dd');
}

export function getStartOfZonedDayUTC(date: Date, timezone: string): Date {
  const zoned = toZonedTime(date, timezone);
  const start = startOfDay(zoned);
  return fromZonedTime(start, timezone);
}

export function getMonthRangeUTC(month: Date, timezone: string): { startUtc: Date; endUtc: Date } {
  const zonedMonth = toZonedTime(month, timezone);
  const startLocal = startOfMonth(zonedMonth);
  const nextMonthLocal = addMonths(startLocal, 1);

  return {
    startUtc: fromZonedTime(startLocal, timezone),
    endUtc: fromZonedTime(nextMonthLocal, timezone),
  };
}

export function formatMonthLabel(month: Date, timezone: string): string {
  const zoned = toZonedTime(month, timezone);
  return format(zoned, 'MMM yyyy');
}

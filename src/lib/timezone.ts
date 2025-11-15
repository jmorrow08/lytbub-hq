import { SupabaseClient } from '@supabase/supabase-js';

export const DEFAULT_TIMEZONE = 'America/New_York';

type FormatterCacheKey = string;
type ZonedDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const dateTimeFormatters = new Map<FormatterCacheKey, Intl.DateTimeFormat>();
const dayFormatters = new Map<FormatterCacheKey, Intl.DateTimeFormat>();
const monthLabelFormatters = new Map<FormatterCacheKey, Intl.DateTimeFormat>();

const getDateTimeFormatter = (timeZone: string) => {
  if (!dateTimeFormatters.has(timeZone)) {
    dateTimeFormatters.set(
      timeZone,
      new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })
    );
  }
  return dateTimeFormatters.get(timeZone)!;
};

const getDayFormatter = (timeZone: string) => {
  if (!dayFormatters.has(timeZone)) {
    dayFormatters.set(
      timeZone,
      new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
    );
  }
  return dayFormatters.get(timeZone)!;
};

const getMonthLabelFormatter = (timeZone: string) => {
  if (!monthLabelFormatters.has(timeZone)) {
    monthLabelFormatters.set(
      timeZone,
      new Intl.DateTimeFormat('en-US', {
        timeZone,
        month: 'short',
        year: 'numeric',
      })
    );
  }
  return monthLabelFormatters.get(timeZone)!;
};

const getBrowserTimezone = (): string | undefined => {
  if (typeof window === 'undefined') return undefined;
  if (typeof Intl === 'undefined' || typeof Intl.DateTimeFormat === 'undefined') return undefined;
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
};

const getZonedDateParts = (date: Date, timeZone: string): ZonedDateParts => {
  const formatter = getDateTimeFormatter(timeZone);
  const parts = formatter.formatToParts(date);
  const filled: Record<string, number> = {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: date.getUTCSeconds(),
  };

  parts.forEach((part) => {
    if (part.type !== 'literal') {
      filled[part.type] = Number(part.value);
    }
  });

  return {
    year: filled.year,
    month: filled.month,
    day: filled.day,
    hour: filled.hour,
    minute: filled.minute,
    second: filled.second,
  };
};

const getTimeZoneOffsetMs = (date: Date, timeZone: string): number => {
  const parts = getZonedDateParts(date, timeZone);
  const zonedUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return zonedUtc - date.getTime();
};

const getUtcInstantFromZonedComponents = (
  {
    year,
    month,
    day,
    hour = 0,
    minute = 0,
    second = 0,
  }: { year: number; month: number; day: number; hour?: number; minute?: number; second?: number },
  timeZone: string
): Date => {
  const initial = Date.UTC(year, month - 1, day, hour, minute, second);
  const initialOffset = getTimeZoneOffsetMs(new Date(initial), timeZone);
  let candidate = initial - initialOffset;
  const adjustedOffset = getTimeZoneOffsetMs(new Date(candidate), timeZone);
  if (adjustedOffset !== initialOffset) {
    candidate = initial - adjustedOffset;
  }
  return new Date(candidate);
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
  return getDayFormatter(timezone).format(date);
}

export function getStartOfZonedDayUTC(date: Date, timezone: string): Date {
  const parts = getZonedDateParts(date, timezone);
  return getUtcInstantFromZonedComponents(
    { year: parts.year, month: parts.month, day: parts.day },
    timezone
  );
}

export function getMonthRangeUTC(month: Date, timezone: string): { startUtc: Date; endUtc: Date } {
  const parts = getZonedDateParts(month, timezone);
  const startUtc = getUtcInstantFromZonedComponents(
    { year: parts.year, month: parts.month, day: 1 },
    timezone
  );

  let nextMonth = parts.month + 1;
  let nextYear = parts.year;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear += 1;
  }

  const endUtc = getUtcInstantFromZonedComponents(
    { year: nextYear, month: nextMonth, day: 1 },
    timezone
  );

  return { startUtc, endUtc };
}

export function formatMonthLabel(month: Date, timezone: string): string {
  return getMonthLabelFormatter(timezone).format(month);
}

export function getDayKeyStartUtc(dayKey: string, timezone: string): Date {
  const [year, month, day] = dayKey.split('-').map((value) => parseInt(value, 10));
  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return getStartOfZonedDayUTC(new Date(dayKey), timezone);
  }
  return getUtcInstantFromZonedComponents({ year, month, day }, timezone);
}

export function formatInTimezone(
  date: Date,
  timezone: string,
  options: Intl.DateTimeFormatOptions,
  locale = 'en-US'
): string {
  return new Intl.DateTimeFormat(locale, { timeZone: timezone, ...options }).format(date);
}

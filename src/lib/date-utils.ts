const YMD_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function fromYmd(value: string): Date | null {
  if (!YMD_REGEX.test(value)) return null;
  const [yearStr, monthStr, dayStr] = value.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  // Construct the date in UTC so formatting is consistent across timezones.
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

export type DateLike = string | number | Date | null | undefined;

function isDateOnlyString(input: DateLike): input is string {
  return typeof input === 'string' && YMD_REGEX.test(input.trim());
}

export function parseDateLike(input: DateLike): Date | null {
  if (input == null) return null;
  if (input instanceof Date) {
    const clone = new Date(input.getTime());
    return Number.isNaN(clone.getTime()) ? null : clone;
  }
  if (typeof input === 'number') {
    const date = new Date(input);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return null;
    const ymdDate = fromYmd(trimmed);
    if (ymdDate) return ymdDate;
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

export function formatDate(
  input: DateLike,
  options?: Intl.DateTimeFormatOptions,
  locale?: string,
): string | null {
  const date = parseDateLike(input);
  if (!date) return null;
  const needsUtc = isDateOnlyString(input) && options?.timeZone == null;
  const formatOptions = needsUtc ? { ...(options ?? {}), timeZone: 'UTC' } : options;
  return date.toLocaleDateString(locale, formatOptions);
}

export function formatDateTime(
  input: DateLike,
  options?: Intl.DateTimeFormatOptions,
  locale?: string,
): string | null {
  const date = parseDateLike(input);
  if (!date) return null;
  const needsUtc = isDateOnlyString(input) && options?.timeZone == null;
  const formatOptions = needsUtc ? { ...(options ?? {}), timeZone: 'UTC' } : options;
  return date.toLocaleString(locale, formatOptions);
}

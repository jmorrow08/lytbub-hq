import type { DraftLine } from '@/lib/billing-calculator';

export function parseDueDate(raw?: string): { ymd: string | null; unix: number | null } {
  if (!raw) return { ymd: null, unix: null };
  const isYmd = /^\d{4}-\d{2}-\d{2}$/.test(raw);
  if (!isYmd) {
    throw Object.assign(new Error('dueDate must follow YYYY-MM-DD format.'), { status: 400 });
  }
  const [yStr, mStr, dStr] = raw.split('-');
  const y = Number.parseInt(yStr, 10);
  const m = Number.parseInt(mStr, 10);
  const d = Number.parseInt(dStr, 10);
  const localDate = new Date(y, m - 1, d);
  if (Number.isNaN(localDate.getTime())) {
    throw Object.assign(new Error('dueDate is invalid.'), { status: 400 });
  }
  return {
    ymd: raw,
    unix: Math.floor(localDate.getTime() / 1000),
  };
}

export function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function mapPendingToLineType(sourceType: string | null | undefined): DraftLine['lineType'] {
  switch (sourceType) {
    case 'usage':
      return 'usage';
    default:
      return 'project';
  }
}

export function generateInvoiceNumber(): string {
  const date = new Date();
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const randomSuffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `INV-${year}${month}-${randomSuffix}`;
}

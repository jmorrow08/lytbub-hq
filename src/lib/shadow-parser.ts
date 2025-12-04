import type { PortalShadowItem, PortalShadowSummary } from '@/lib/invoice-portal';

type ShadowCsvParseResult = {
  items: PortalShadowItem[];
  summary: PortalShadowSummary | undefined;
  warnings: string[];
  header: string[];
};

// Flexible header mapping for CSV inputs
const HEADER_SYNONYMS: Record<string, string> = {
  // item label
  label: 'label',
  item: 'label',
  fee: 'label',
  title: 'label',
  name: 'label',
  description: 'description',
  details: 'description',
  note: 'description',
  memo: 'description',
  hours: 'hours',
  qty: 'hours',
  quantity: 'hours',
  rate: 'market_rate_per_hour',
  hourly_rate: 'market_rate_per_hour',
  market_rate: 'market_rate_per_hour',
  market_rate_per_hour: 'market_rate_per_hour',
  unit_rate: 'market_rate_per_hour',
  unit_price: 'market_rate_per_hour',
  implied_value: 'implied_value',
  value: 'implied_value',
  amount: 'implied_value',
  market_value: 'implied_value',
  complimentary: 'is_complimentary',
  included: 'is_complimentary',
  is_complimentary: 'is_complimentary',
  // retainer context
  retainer_current: 'retainer_current',
  current_retainer: 'retainer_current',
  current: 'retainer_current',
  retainer_normal: 'retainer_normal',
  normal_retainer: 'retainer_normal',
  normal: 'retainer_normal',
  retainer_includes: 'retainer_includes',
  includes: 'retainer_includes',
  included_items: 'retainer_includes',
};

function normalizeHeader(header: string): string {
  const basic = header.trim().toLowerCase();
  const collapsed = basic
    .replace(/\s+/g, ' ')
    .replace(/[^\w ]+/g, '')
    .trim();
  return (
    HEADER_SYNONYMS[collapsed] ||
    HEADER_SYNONYMS[basic] ||
    HEADER_SYNONYMS[basic.replace(/[\s-_]+/g, ' ')] ||
    collapsed.replace(/\s+/g, '_')
  );
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

export function parseShadowCsvText(csvText: string): ShadowCsvParseResult {
  const warnings: string[] = [];
  const items: PortalShadowItem[] = [];
  const sanitized = csvText.replace(/\r\n/g, '\n').trim();
  const lines = sanitized.length > 0 ? sanitized.split('\n') : [];
  if (lines.length === 0) {
    return { items, summary: undefined, warnings: ['CSV file is empty.'], header: [] };
  }
  const headerCells = splitCsvLine(lines[0]).map((h) => normalizeHeader(h));
  const header = headerCells;

  const idx = (key: string) => header.indexOf(key);
  const idLabel = idx('label');
  const idDescription = idx('description');
  const idHours = idx('hours');
  const idRate = idx('market_rate_per_hour');
  const idValue = idx('implied_value');
  const idComplimentary = idx('is_complimentary');
  const idRetainerCurrent = idx('retainer_current');
  const idRetainerNormal = idx('retainer_normal');
  const idRetainerIncludes = idx('retainer_includes');

  let retainerCurrentCents: number | undefined;
  let retainerNormalCents: number | undefined;
  let retainerIncludes: string[] | undefined;

  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    const cells = splitCsvLine(line);

    // Capture retainer context if present
    const rawCurrent = idRetainerCurrent >= 0 ? cells[idRetainerCurrent] ?? '' : '';
    const rawNormal = idRetainerNormal >= 0 ? cells[idRetainerNormal] ?? '' : '';
    const rawIncludes = idRetainerIncludes >= 0 ? cells[idRetainerIncludes] ?? '' : '';

    const parseMoney = (value: string): number | undefined => {
      if (!value) return undefined;
      const normalized = value.replace(/[^0-9.-]/g, '');
      const dollars = Number(normalized);
      if (!Number.isFinite(dollars)) return undefined;
      return Math.round(dollars * 100);
    };

    if (rawCurrent) retainerCurrentCents = parseMoney(rawCurrent) ?? retainerCurrentCents;
    if (rawNormal) retainerNormalCents = parseMoney(rawNormal) ?? retainerNormalCents;
    if (rawIncludes) {
      const split = rawIncludes
        .split(/[;|,]/g)
        .map((s) => s.trim())
        .filter(Boolean);
      if (split.length > 0) {
        retainerIncludes = Array.from(new Set([...(retainerIncludes ?? []), ...split]));
      }
    }

    // Build item if a label or value exists
    const label = idLabel >= 0 ? (cells[idLabel] ?? '').trim() : '';
    const hasAnyItemSignal =
      label.length > 0 || (idValue >= 0 && (cells[idValue] ?? '').trim().length > 0);
    if (!hasAnyItemSignal) continue;

    const description = idDescription >= 0 ? (cells[idDescription] ?? '').trim() : '';
    const rawHours = idHours >= 0 ? (cells[idHours] ?? '').trim() : '';
    const rawRate = idRate >= 0 ? (cells[idRate] ?? '').trim() : '';
    const rawValue = idValue >= 0 ? (cells[idValue] ?? '').trim() : '';
    const rawComplimentary = idComplimentary >= 0 ? (cells[idComplimentary] ?? '').trim() : '';

    const toNumber = (val: string): number | undefined => {
      if (!val) return undefined;
      const num = Number(val.replace(/[^0-9.-]/g, ''));
      return Number.isFinite(num) ? num : undefined;
    };

    const hours = toNumber(rawHours);
    const marketRatePerHour = toNumber(rawRate);
    const impliedValue = toNumber(rawValue);
    const isComplimentary =
      typeof rawComplimentary === 'string'
        ? /^(true|yes|y|1|included)$/i.test(rawComplimentary.trim())
        : undefined;

    items.push({
      label: label || 'Value item',
      description: description || undefined,
      hours,
      marketRatePerHour,
      impliedValue,
      isComplimentary,
    });
  }

  const totalImpliedValue =
    items.reduce((sum, item) => sum + (Number(item.impliedValue) || 0), 0) || undefined;
  const complimentaryValue =
    items
      .filter((i) => i.isComplimentary)
      .reduce((sum, item) => sum + (Number(item.impliedValue) || 0), 0) || undefined;

  const summary: PortalShadowSummary | undefined =
    totalImpliedValue ||
    complimentaryValue ||
    retainerCurrentCents ||
    retainerNormalCents ||
    (retainerIncludes?.length ?? 0) > 0
      ? {
          totalImpliedValue,
          complimentaryValue,
          retainerCurrentCents,
          retainerNormalCents,
          retainerIncludes,
        }
      : undefined;

  return { items, summary, warnings, header };
}

// Best-effort text extractor for PDF-derived text
export function extractShadowFromText(text: string): {
  items: PortalShadowItem[];
  summary: PortalShadowSummary | undefined;
  warnings: string[];
} {
  const warnings: string[] = [];
  const items: PortalShadowItem[] = [];

  const findMoney = (s: string): number | undefined => {
    const m = s.match(/\$?\s*([0-9]{1,3}(?:,[0-9]{3})*|\d+)(\.\d{2})?/);
    if (!m) return undefined;
    const normalized = m[0].replace(/[^0-9.]/g, '');
    const dollars = Number(normalized);
    return Number.isFinite(dollars) ? Math.round(dollars * 100) : undefined;
  };

  // Try to detect retainer current and normal
  const lower = text.toLowerCase();
  let retainerCurrentCents: number | undefined;
  let retainerNormalCents: number | undefined;
  let retainerIncludes: string[] | undefined;

  const currentMatch =
    /current\s+retainer(?:\s*fee)?[:\-]?\s*\$?\s*[\d,]+(?:\.\d{2})?/i.exec(text) ||
    /retainer[:\-]?\s*current[:\-]?\s*\$?\s*[\d,]+(?:\.\d{2})?/i.exec(text);
  if (currentMatch) {
    retainerCurrentCents = findMoney(currentMatch[0]);
  }
  const normalMatch =
    /normal\s+retainer(?:\s*fee)?[:\-]?\s*\$?\s*[\d,]+(?:\.\d{2})?/i.exec(text) ||
    /retainer[:\-]?\s*normal[:\-]?\s*\$?\s*[\d,]+(?:\.\d{2})?/i.exec(text);
  if (normalMatch) {
    retainerNormalCents = findMoney(normalMatch[0]);
  }

  // Try to detect "includes" list
  const includesMatch =
    /retainer\s+includes[:\-]?\s*(.+?)(?:\n{2,}|$)/i.exec(text) ||
    /includes[:\-]\s*(.+?)(?:\n{2,}|$)/i.exec(text);
  if (includesMatch && includesMatch[1]) {
    retainerIncludes = includesMatch[1]
      .split(/[;,•\n]/g)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  // Heuristic for items: lines with " - " or bullets that contain a $ value or hours × rate
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  for (const line of lines) {
    if (!line) continue;
    const bullet = /^[\-\u2022•]/.test(line);
    const hasValue = /\$\s*[\d,]+/.test(line) || /\b\d+(\.\d+)?\s*(hours|hrs|hr)\b/i.test(line);
    if (!bullet && !hasValue) continue;

    // Extract hours × rate pattern
    const hoursMatch = /(\d+(?:\.\d+)?)\s*(?:hours|hrs|hr)\b/i.exec(line);
    const rateMatch = /\$?\s*([\d,]+(?:\.\d{2})?)\s*\/?\s*(?:hr|hour)/i.exec(line);
    const valueMatch = /\$?\s*([\d,]+(?:\.\d{2})?)/.exec(line);

    const hours = hoursMatch ? Number(hoursMatch[1]) : undefined;
    const marketRatePerHour = rateMatch ? Number(rateMatch[1].replace(/,/g, '')) : undefined;
    const impliedValue = valueMatch ? Number(valueMatch[1].replace(/,/g, '')) : undefined;

    items.push({
      label: line.replace(/^[\-\u2022•]\s*/, '').slice(0, 80),
      description: line,
      hours: Number.isFinite(hours as number) ? (hours as number) : undefined,
      marketRatePerHour: Number.isFinite(marketRatePerHour as number)
        ? (marketRatePerHour as number)
        : undefined,
      impliedValue: Number.isFinite(impliedValue as number) ? (impliedValue as number) : undefined,
    });
  }

  const totalImpliedValue =
    items.reduce((sum, item) => sum + (Number(item.impliedValue) || 0), 0) || undefined;

  const summary: PortalShadowSummary | undefined =
    totalImpliedValue ||
    retainerCurrentCents ||
    retainerNormalCents ||
    (retainerIncludes?.length ?? 0) > 0
      ? {
          totalImpliedValue,
          retainerCurrentCents,
          retainerNormalCents,
          retainerIncludes,
        }
      : undefined;

  if (!items.length) {
    warnings.push('No clear line items detected. Consider uploading a CSV for better accuracy.');
  }

  return { items, summary, warnings };
}


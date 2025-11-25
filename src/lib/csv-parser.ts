export type UsageCsvRow = {
  client_name: string;
  date: string;
  metric_type: string;
  quantity: number;
  unit_price: number;
  description: string;
  // Optional totals supported in flexible parsing
  total_cost?: number;
  total_tokens?: number;
};

export type UsageCsvParseResult = {
  rows: UsageCsvRow[];
  errors: string[];
  header: string[];
};

/**
 * Flexible header support:
 * - date is required
 * - Either unit_price or total_cost must be present
 * - quantity, metric_type, description, client_name are optional
 */
const CORE_REQUIRED_HEADERS = ['date'] as const;

// Map common synonyms to our canonical field names
const HEADER_SYNONYMS: Record<string, string> = {
  // client
  client_name: 'client_name',
  client: 'client_name',
  customer: 'client_name',
  account: 'client_name',
  'client name': 'client_name',
  'project name': 'client_name',
  project: 'client_name',

  // date
  date: 'date',
  day: 'date',
  event_date: 'date',
  timestamp: 'date',

  // metric / type
  metric: 'metric_type',
  metric_type: 'metric_type',
  usage_type: 'metric_type',
  service: 'metric_type',
  item: 'metric_type',
  category: 'metric_type',
  charge_type: 'metric_type',

  // quantity
  quantity: 'quantity',
  qty: 'quantity',
  units: 'quantity',
  count: 'quantity',
  hours: 'quantity',

  // unit price
  unit_price: 'unit_price',
  'unit price': 'unit_price',
  price: 'unit_price',
  rate: 'unit_price',
  'unit cost': 'unit_price',
  unit_cost: 'unit_price',
  cost_per_unit: 'unit_price',
  'per unit rate': 'unit_price',
  unitamount: 'unit_price',
  unit_amount: 'unit_price',

  // total cost (fallback if unit_price missing)
  total: 'total_cost',
  amount: 'total_cost',
  total_cost: 'total_cost',
  cost: 'total_cost',
  charge: 'total_cost',
  price_total: 'total_cost',

  // tokens
  total_tokens: 'total_tokens',
  'total tokens': 'total_tokens',
  tokens: 'total_tokens',

  // description
  description: 'description',
  details: 'description',
  note: 'description',
  memo: 'description',
  item_description: 'description',
  product: 'description',
};

function normalizeHeaderKey(header: string): string {
  // Normalize: trim, lowercase, collapse spaces/underscores/dashes
  const basic = header.trim().toLowerCase();
  const collapsed = basic
    .replace(/\s+/g, ' ')
    .replace(/[^\w ]+/g, '')
    .replace(/ +/g, ' ')
    .trim();
  const canonical =
    HEADER_SYNONYMS[collapsed] ||
    HEADER_SYNONYMS[basic] ||
    HEADER_SYNONYMS[basic.replace(/[\s-_]+/g, ' ')] ||
    collapsed.replace(/\s+/g, '_');
  return canonical;
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

function normalizeHeader(header: string): string {
  return normalizeHeaderKey(header);
}

export function parseUsageCsvText(csvText: string): UsageCsvParseResult {
  const rows: UsageCsvRow[] = [];
  const errors: string[] = [];

  const sanitized = csvText.replace(/\r\n/g, '\n').trim();
  const allLines = sanitized.length > 0 ? sanitized.split('\n') : [];

  if (allLines.length === 0) {
    return { rows, errors: ['CSV file is empty.'], header: [] };
  }

  const headerLine = splitCsvLine(allLines[0]);
  const normalizedHeader = headerLine.map((cell) => normalizeHeader(cell));

  // Validate core requirements
  for (const required of CORE_REQUIRED_HEADERS) {
    if (!normalizedHeader.includes(required)) {
      errors.push(`Missing required column "${required}".`);
    }
  }
  const hasUnitPrice = normalizedHeader.includes('unit_price');
  const hasTotalCost = normalizedHeader.includes('total_cost');
  if (!hasUnitPrice && !hasTotalCost) {
    errors.push('CSV must include either "unit_price" or "total_cost" column.');
  }

  // Identity map: normalizedHeader already mapped to canonical keys
  const headerMap = normalizedHeader.map((header) => header);

  for (let lineIndex = 1; lineIndex < allLines.length; lineIndex += 1) {
    const originalLine = allLines[lineIndex];
    if (!originalLine || originalLine.trim().length === 0) {
      continue;
    }

    const cells = splitCsvLine(originalLine);
    const record: Record<string, string> = {};
    for (let i = 0; i < headerMap.length; i += 1) {
      record[headerMap[i]] = cells[i]?.trim() ?? '';
    }

    if (
      !record.client_name &&
      !record.metric_type &&
      !record.description &&
      !record.total_cost &&
      !record.unit_price
    ) {
      continue;
    }

    // Quantity: default to 1 if missing and only total is provided
    let quantity = Number(record.quantity);
    if (record.quantity === '' || Number.isNaN(quantity)) {
      quantity = 1;
    }

    // Parse price fields
    const rawUnitPrice = record.unit_price;
    const rawTotal = record.total_cost;
    let unitPrice = Number(rawUnitPrice);
    const total = Number(rawTotal);

    // Derive unit price from total if needed
    if ((rawUnitPrice === '' || Number.isNaN(unitPrice)) && !Number.isNaN(total)) {
      // If quantity is zero or invalid at this point, reject the row instead of assuming 1
      if (!Number.isFinite(quantity) || quantity <= 0) {
        errors.push(
          `Row ${lineIndex}: quantity must be a positive number when deriving unit price from total.`,
        );
        continue;
      }
      unitPrice = total / quantity;
    }

    if (Number.isNaN(quantity) || !Number.isFinite(quantity) || quantity <= 0) {
      errors.push(`Row ${lineIndex}: quantity must be a positive number.`);
      continue;
    }

    if (Number.isNaN(unitPrice)) {
      errors.push(`Row ${lineIndex}: unit price/total is missing or invalid.`);
      continue;
    }

    const totalTokens = Number(record.total_tokens);

    rows.push({
      client_name: record.client_name,
      date: record.date,
      metric_type: record.metric_type,
      quantity,
      unit_price: unitPrice,
      description: record.description,
      total_cost: !Number.isNaN(total) ? total : undefined,
      total_tokens: !Number.isNaN(totalTokens) ? totalTokens : undefined,
    });
  }

  return { rows, errors, header: normalizedHeader };
}

export async function parseUsageCsvFile(file: File | Blob): Promise<UsageCsvParseResult> {
  const text = await file.text();
  return parseUsageCsvText(text);
}

export type UsageCsvRow = {
  client_name: string;
  date: string;
  metric_type: string;
  quantity: number;
  unit_price: number;
  description: string;
};

export type UsageCsvParseResult = {
  rows: UsageCsvRow[];
  errors: string[];
  header: string[];
};

const REQUIRED_HEADERS = [
  'client_name',
  'date',
  'metric_type',
  'quantity',
  'unit_price',
  'description',
] as const;

const NORMALIZED_HEADER_LOOKUP = REQUIRED_HEADERS.reduce<Record<string, string>>((acc, header) => {
  acc[header] = header;
  return acc;
}, {});

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
  return header.trim().toLowerCase();
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

  for (const required of REQUIRED_HEADERS) {
    if (!normalizedHeader.includes(required)) {
      errors.push(`Missing required column "${required}".`);
    }
  }

  const headerMap = normalizedHeader.map((header) => NORMALIZED_HEADER_LOOKUP[header] || header);

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

    if (!record.client_name && !record.metric_type && !record.description) {
      continue;
    }

    const quantity = Number(record.quantity);
    const unitPrice = Number(record.unit_price);

    if (Number.isNaN(quantity)) {
      errors.push(`Row ${lineIndex}: quantity must be a number.`);
      continue;
    }

    if (Number.isNaN(unitPrice)) {
      errors.push(`Row ${lineIndex}: unit_price must be a number.`);
      continue;
    }

    rows.push({
      client_name: record.client_name,
      date: record.date,
      metric_type: record.metric_type,
      quantity,
      unit_price: unitPrice,
      description: record.description,
    });
  }

  return { rows, errors, header: normalizedHeader };
}

export async function parseUsageCsvFile(file: File | Blob): Promise<UsageCsvParseResult> {
  const text = await file.text();
  return parseUsageCsvText(text);
}


import type { ShipmentPlanImportRow } from "@/lib/shipmentPlan/service";

const CANONICAL_KEYS: Array<keyof ShipmentPlanImportRow> = [
  "import_batch_id",
  "shipment_id",
  "marketplace",
  "flow_type",
  "planned_date",
  "planned_time_window",
  "deadline_at",
  "destination",
  "carrier_type",
  "carrier_name",
  "booking_ref",
  "products_sku",
  "sku_name",
  "planned_qty",
  "comment_logistic",
  "source_table",
  "pasted_at",
  "pasted_by_user_id",
];

type ParseSuccess = {
  ok: true;
  format: "json" | "delimited";
  rows: Array<Record<string, unknown>>;
};

type ParseFailure = {
  ok: false;
  error: string;
};

function normalizeHeader(value: string): string {
  return value.trim();
}

function normalizeCell(value: string): string {
  return value.trim();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toRowsFromJson(value: unknown): Array<Record<string, unknown>> | null {
  if (Array.isArray(value)) {
    return value.every(isPlainObject) ? value : null;
  }

  if (isPlainObject(value) && Array.isArray(value.rows) && value.rows.every(isPlainObject)) {
    return value.rows;
  }

  return null;
}

function parseDelimited(input: string): ParseSuccess | ParseFailure {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return {
      ok: false,
      error: "Paste shipment plan rows to continue.",
    };
  }

  const delimiter = lines[0].includes("\t") ? "\t" : lines[0].includes(",") ? "," : null;
  if (!delimiter) {
    return {
      ok: false,
      error: "Pasted text must be JSON or a spreadsheet-style table with tab/comma-separated columns.",
    };
  }

  const firstLineCells = lines[0].split(delimiter).map(normalizeCell);
  const firstLineIsHeader = CANONICAL_KEYS.every((key, index) => firstLineCells[index] === key);
  if (firstLineIsHeader && lines.length < 2) {
    return {
      ok: false,
      error: "Paste a header row and at least one shipment row.",
    };
  }

  const headers = firstLineIsHeader ? firstLineCells.map(normalizeHeader) : [...CANONICAL_KEYS];
  const dataLines = firstLineIsHeader ? lines.slice(1) : lines;
  const knownHeaders = headers.filter(Boolean);
  if (knownHeaders.length === 0) {
    return { ok: false, error: "The pasted header row is empty." };
  }

  if (!firstLineIsHeader && firstLineCells.length !== CANONICAL_KEYS.length) {
    return {
      ok: false,
      error:
        "Without a header row, each line must contain all canonical columns in order: import_batch_id ... pasted_by_user_id.",
    };
  }

  try {
    const rows = dataLines.map((line) => {
      const cells = line.split(delimiter);
      const row: Record<string, unknown> = {};

      if (!firstLineIsHeader && cells.length !== CANONICAL_KEYS.length) {
        throw new Error(
          "Without a header row, each line must contain all canonical columns in order: import_batch_id ... pasted_by_user_id."
        );
      }

      for (let index = 0; index < headers.length; index += 1) {
        const header = headers[index];
        if (!header) continue;

        const rawValue = normalizeCell(cells[index] ?? "");
        row[header] = rawValue;
      }

      return row;
    });

    return {
      ok: true,
      format: "delimited",
      rows,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to parse pasted shipment rows.",
    };
  }
}

export function parseShipmentPlanPastedRows(input: string): ParseSuccess | ParseFailure {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, error: "Paste shipment plan rows to continue." };
  }

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      const rows = toRowsFromJson(parsed);
      if (!rows || rows.length === 0) {
        return {
          ok: false,
          error: "JSON input must be an array of shipment-plan rows or an object with a non-empty 'rows' array.",
        };
      }

      return { ok: true, format: "json", rows };
    } catch {
      return { ok: false, error: "JSON input could not be parsed." };
    }
  }

  return parseDelimited(trimmed);
}

export function shipmentPlanImportTemplateHeaders(): string {
  return CANONICAL_KEYS.join("\t");
}

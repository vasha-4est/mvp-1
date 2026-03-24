import { parseErrorPayload } from "@/lib/api/gasError";
import { callGas } from "@/lib/integrations/gasClient";

const CANONICAL_ROW_KEYS = [
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
] as const;

const REQUIRED_ROW_KEYS = [
  "import_batch_id",
  "shipment_id",
  "marketplace",
  "flow_type",
  "planned_date",
  "destination",
  "products_sku",
  "planned_qty",
] as const;

const LEGACY_FORBIDDEN_KEYS = new Set(["ship_date", "sku_id", "qty", "comment"]);
const CANONICAL_ROW_KEY_SET = new Set<string>(CANONICAL_ROW_KEYS);

export type ShipmentPlanImportRow = {
  import_batch_id: string;
  shipment_id: string;
  marketplace: string;
  flow_type: string;
  planned_date: string;
  planned_time_window: string;
  deadline_at: string;
  destination: string;
  carrier_type: string;
  carrier_name: string;
  booking_ref: string;
  products_sku: string;
  sku_name: string;
  planned_qty: number;
  comment_logistic: string;
  source_table: string;
  pasted_at: string;
  pasted_by_user_id: string;
};

export type ShipmentPlanImportValidationError = {
  row_index: number;
  field: string;
  code: string;
  message: string;
};

type ShipmentPlanImportStats = {
  rows_count: number;
  shipments_count: number;
  source_table_values: string[];
};

type ShipmentPlanImportValidateSuccess = {
  ok: true;
  import_batch_id: string;
  valid: boolean;
  stats: ShipmentPlanImportStats;
  normalized_rows: ShipmentPlanImportRow[];
  errors: ShipmentPlanImportValidationError[];
};

type ShipmentPlanImportCommitSuccess = {
  ok: true;
  import_batch_id: string;
  replayed: boolean;
  stats: ShipmentPlanImportStats;
  staged_rows: Array<Record<string, unknown>>;
};

type ShipmentPlanImportServiceError = {
  ok: false;
  code: string;
  error: string;
  details?: Record<string, unknown>;
};

type GasValidationResponse = {
  import_batch_id?: unknown;
  valid?: unknown;
  stats?: unknown;
  normalized_rows?: unknown;
  errors?: unknown;
};

type GasCommitResponse = {
  import_batch_id?: unknown;
  replayed?: unknown;
  stats?: unknown;
  staged_rows?: unknown;
};

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePositiveInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.trim());
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toServiceError(rawError: unknown, fallback: string): ShipmentPlanImportServiceError {
  const parsed = parseErrorPayload(rawError);
  return {
    ok: false,
    code: parsed.code || "BAD_GATEWAY",
    error: parsed.error || fallback,
    ...(parsed.details ? { details: parsed.details } : {}),
  };
}

function normalizeValidationErrors(value: unknown): ShipmentPlanImportValidationError[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isPlainObject(item)) {
      return [];
    }

    const rowIndex = typeof item.row_index === "number" && Number.isInteger(item.row_index) ? item.row_index : -1;
    const field = normalizeText(item.field);
    const code = normalizeText(item.code);
    const message = normalizeText(item.message);

    if (rowIndex < 0 || !field || !code || !message) {
      return [];
    }

    return [{ row_index: rowIndex, field, code, message }];
  });
}

function normalizeStats(value: unknown, rowsCountFallback: number): ShipmentPlanImportStats {
  if (!isPlainObject(value)) {
    return {
      rows_count: rowsCountFallback,
      shipments_count: 0,
      source_table_values: [],
    };
  }

  const rowsCount =
    typeof value.rows_count === "number" && Number.isInteger(value.rows_count) && value.rows_count >= 0
      ? value.rows_count
      : rowsCountFallback;
  const shipmentsCount =
    typeof value.shipments_count === "number" && Number.isInteger(value.shipments_count) && value.shipments_count >= 0
      ? value.shipments_count
      : 0;
  const sourceTableValues = Array.isArray(value.source_table_values)
    ? value.source_table_values.map((entry) => normalizeText(entry)).filter(Boolean)
    : [];

  return {
    rows_count: rowsCount,
    shipments_count: shipmentsCount,
    source_table_values: sourceTableValues,
  };
}

function normalizeRows(value: unknown): ShipmentPlanImportRow[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isPlainObject(item)) {
      return [];
    }

    const plannedQty = normalizePositiveInteger(item.planned_qty);
    if (plannedQty === null) {
      return [];
    }

    return [
      {
        import_batch_id: normalizeText(item.import_batch_id),
        shipment_id: normalizeText(item.shipment_id),
        marketplace: normalizeText(item.marketplace),
        flow_type: normalizeText(item.flow_type),
        planned_date: normalizeText(item.planned_date),
        planned_time_window: normalizeText(item.planned_time_window),
        deadline_at: normalizeText(item.deadline_at),
        destination: normalizeText(item.destination),
        carrier_type: normalizeText(item.carrier_type),
        carrier_name: normalizeText(item.carrier_name),
        booking_ref: normalizeText(item.booking_ref),
        products_sku: normalizeText(item.products_sku),
        sku_name: normalizeText(item.sku_name),
        planned_qty: plannedQty,
        comment_logistic: normalizeText(item.comment_logistic),
        source_table: normalizeText(item.source_table),
        pasted_at: normalizeText(item.pasted_at),
        pasted_by_user_id: normalizeText(item.pasted_by_user_id),
      },
    ];
  });
}

export function parseShipmentPlanImportBody(body: unknown):
  | { ok: true; rows: ShipmentPlanImportRow[] }
  | { ok: false; error: string; code: "VALIDATION_ERROR" } {
  if (!isPlainObject(body)) {
    return { ok: false, code: "VALIDATION_ERROR", error: "Request body must be a JSON object" };
  }

  const rowsRaw = body.rows;
  if (!Array.isArray(rowsRaw) || rowsRaw.length === 0) {
    return { ok: false, code: "VALIDATION_ERROR", error: "Field 'rows' must be a non-empty array" };
  }

  const rows: ShipmentPlanImportRow[] = [];

  for (let index = 0; index < rowsRaw.length; index += 1) {
    const row = rowsRaw[index];
    if (!isPlainObject(row)) {
      return { ok: false, code: "VALIDATION_ERROR", error: `Row ${index + 1} must be an object` };
    }

    for (const key of Object.keys(row)) {
      if (LEGACY_FORBIDDEN_KEYS.has(key)) {
        return {
          ok: false,
          code: "VALIDATION_ERROR",
          error: `Row ${index + 1} uses legacy field '${key}', which is not supported in PR-111`,
        };
      }

      if (!CANONICAL_ROW_KEY_SET.has(key)) {
        return {
          ok: false,
          code: "VALIDATION_ERROR",
          error: `Row ${index + 1} contains unsupported field '${key}'`,
        };
      }
    }

    const plannedQty = normalizePositiveInteger(row.planned_qty);
    if (plannedQty === null) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        error: `Row ${index + 1} field 'planned_qty' must be a positive integer`,
      };
    }

    const normalizedRow: ShipmentPlanImportRow = {
      import_batch_id: normalizeText(row.import_batch_id),
      shipment_id: normalizeText(row.shipment_id),
      marketplace: normalizeText(row.marketplace),
      flow_type: normalizeText(row.flow_type),
      planned_date: normalizeText(row.planned_date),
      planned_time_window: normalizeText(row.planned_time_window),
      deadline_at: normalizeText(row.deadline_at),
      destination: normalizeText(row.destination),
      carrier_type: normalizeText(row.carrier_type),
      carrier_name: normalizeText(row.carrier_name),
      booking_ref: normalizeText(row.booking_ref),
      products_sku: normalizeText(row.products_sku),
      sku_name: normalizeText(row.sku_name),
      planned_qty: plannedQty,
      comment_logistic: normalizeText(row.comment_logistic),
      source_table: normalizeText(row.source_table),
      pasted_at: normalizeText(row.pasted_at),
      pasted_by_user_id: normalizeText(row.pasted_by_user_id),
    };

    for (const requiredKey of REQUIRED_ROW_KEYS) {
      const value = normalizedRow[requiredKey];
      if ((typeof value === "string" && value === "") || value === 0) {
        return {
          ok: false,
          code: "VALIDATION_ERROR",
          error: `Row ${index + 1} field '${requiredKey}' is required`,
        };
      }
    }

    rows.push(normalizedRow);
  }

  const batchIds = Array.from(new Set(rows.map((row) => row.import_batch_id)));
  if (batchIds.length !== 1) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      error: "All rows in one request must share exactly one import_batch_id",
    };
  }

  return { ok: true, rows };
}

export async function validateShipmentPlanImport(input: {
  requestId: string;
  rows: ShipmentPlanImportRow[];
}): Promise<ShipmentPlanImportValidateSuccess | ShipmentPlanImportServiceError> {
  const response = await callGas<GasValidationResponse>(
    "shipment_plan_import.validate",
    { rows: input.rows },
    input.requestId
  );

  if (!response.ok || !response.data) {
    return toServiceError(response.error, "Failed to validate shipment plan import");
  }

  const normalizedRows = normalizeRows(response.data.normalized_rows);
  return {
    ok: true,
    import_batch_id: normalizeText(response.data.import_batch_id),
    valid: response.data.valid === true,
    stats: normalizeStats(response.data.stats, normalizedRows.length),
    normalized_rows: normalizedRows,
    errors: normalizeValidationErrors(response.data.errors),
  };
}

export async function commitShipmentPlanImport(input: {
  requestId: string;
  rows: ShipmentPlanImportRow[];
  actorUserId: string;
  actorRoleId: string;
}): Promise<ShipmentPlanImportCommitSuccess | ShipmentPlanImportServiceError> {
  const response = await callGas<GasCommitResponse>(
    "shipment_plan_import.commit",
    {
      rows: input.rows,
      actor_user_id: input.actorUserId,
      actor_role_id: input.actorRoleId,
    },
    input.requestId
  );

  if (!response.ok || !response.data) {
    return toServiceError(response.error, "Failed to commit shipment plan import");
  }

  const stagedRows = Array.isArray(response.data.staged_rows)
    ? response.data.staged_rows.filter((item): item is Record<string, unknown> => isPlainObject(item))
    : [];

  return {
    ok: true,
    import_batch_id: normalizeText(response.data.import_batch_id),
    replayed: response.data.replayed === true,
    stats: normalizeStats(response.data.stats, stagedRows.length),
    staged_rows: stagedRows,
  };
}

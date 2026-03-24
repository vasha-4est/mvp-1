import { parseErrorPayload, type ParsedGasError } from "@/lib/api/gasError";
import { callGasRead } from "@/lib/integrations/gasRead";

export type LatestStagedShipmentPlanRow = {
  import_batch_id: string;
  shipment_id: string;
  planned_date: string | null;
  deadline_at: string | null;
  destination: string | null;
  products_sku: string;
  planned_qty: number;
  pasted_at: string | null;
  status: string;
};

type GasResponse = {
  import_batch_id?: unknown;
  rows?: unknown;
};

type GasRow = Record<string, unknown>;

export type LatestStagedShipmentPlanBatchResult =
  | { ok: true; import_batch_id: string | null; rows: LatestStagedShipmentPlanRow[] }
  | ({ ok: false } & ParsedGasError);

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNullableString(value: unknown): string | null {
  const normalized = asString(value);
  return normalized ? normalized : null;
}

function asNumber(value: unknown): number {
  const parsed =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : typeof value === "string"
        ? Number(value.trim())
        : Number.NaN;

  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeError(error: unknown, fallback: string): ParsedGasError {
  const parsed = parseErrorPayload(error);
  return {
    ...parsed,
    error: parsed.error || fallback,
  };
}

function normalizeRow(row: GasRow): LatestStagedShipmentPlanRow | null {
  const importBatchId = asString(row.import_batch_id);
  const shipmentId = asString(row.shipment_id);
  const sku = asString(row.products_sku);
  const status = asString(row.status);

  if (!importBatchId || !shipmentId || !sku || !status) {
    return null;
  }

  return {
    import_batch_id: importBatchId,
    shipment_id: shipmentId,
    planned_date: asNullableString(row.planned_date),
    deadline_at: asNullableString(row.deadline_at),
    destination: asNullableString(row.destination),
    products_sku: sku,
    planned_qty: Math.max(0, asNumber(row.planned_qty)),
    pasted_at: asNullableString(row.pasted_at),
    status,
  };
}

export async function readLatestStagedShipmentPlanBatch(
  requestId: string
): Promise<LatestStagedShipmentPlanBatchResult> {
  const response = await callGasRead<GasResponse>("shipment_plan_import.staged.latest", {}, requestId, {
    timeoutMs: 25_000,
    retries: 2,
    retryBackoffMs: 500,
  });

  if (!response.ok || !response.data) {
    return { ok: false, ...normalizeError(response.error, "Failed to read shipment plan import") };
  }

  const importBatchId = asString(response.data.import_batch_id);
  const rawRows = Array.isArray(response.data.rows) ? (response.data.rows as GasRow[]) : [];
  const rows = rawRows.flatMap((row) => {
    const normalized = normalizeRow(row);
    return normalized ? [normalized] : [];
  });

  return {
    ok: true,
    import_batch_id: importBatchId || null,
    rows,
  };
}

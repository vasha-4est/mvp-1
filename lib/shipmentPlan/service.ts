import { callGas } from "@/lib/integrations/gasClient";
import { parseErrorPayload, type ParsedGasError } from "@/lib/api/gasError";

export type ShipmentPlanImportRow = {
  shipment_id: string;
  ship_date: string;
  destination: string;
  sku_id: string;
  qty: number;
  comment?: string;
};

export type ShipmentPlanImportPayload = {
  tz?: string;
  plan_date?: string;
  shipment_id?: string;
  rows?: ShipmentPlanImportRow[];
  mode?: "commit" | "dry_run";
};

export type ShipmentPlanImportResult = {
  ok: true;
  dry_run?: boolean;
  replayed?: boolean;
  import_id?: string;
  stats: { rows: number; shipments: number; lines: number };
  normalized_preview?: ShipmentPlanImportRow[];
  tz: string;
  generated_at: string;
};

export type ShipmentPlanPreviewShipment = {
  shipment_id: string;
  ship_date: string;
  destination: string;
  total_lines: number;
  total_qty: number;
  status: string;
};

export type ShipmentPlanPreviewResult = {
  ok: true;
  tz: string;
  window: { from_date: string; to_date: string; days: number };
  shipments: ShipmentPlanPreviewShipment[];
  lines_sample?: Array<Record<string, unknown>>;
};

type ServiceError = { ok: false } & ParsedGasError;

function normalizeError(error: unknown): ParsedGasError {
  return parseErrorPayload(error);
}

export async function importShipmentPlan(
  requestId: string,
  payload: ShipmentPlanImportPayload
): Promise<{ ok: true; data: ShipmentPlanImportResult } | ServiceError> {
  const response = await callGas<ShipmentPlanImportResult>("shipment_plan.import", payload, requestId);
  if (!response.ok || !response.data) {
    return { ok: false, ...normalizeError((response as { error?: unknown }).error) };
  }

  return { ok: true, data: response.data };
}

export async function previewShipmentPlan(
  requestId: string,
  payload: { days: number; tz?: string }
): Promise<{ ok: true; data: ShipmentPlanPreviewResult } | ServiceError> {
  const response = await callGas<ShipmentPlanPreviewResult>("shipment_plan.preview", payload, requestId);
  if (!response.ok || !response.data) {
    return { ok: false, ...normalizeError((response as { error?: unknown }).error) };
  }

  return { ok: true, data: response.data };
}

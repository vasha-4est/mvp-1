import { parseErrorPayload, type ParsedGasError } from "@/lib/api/gasError";
import { callGas } from "@/lib/integrations/gasClient";

export type EodSnapshotPayload = {
  ok: true;
  generated_at: string;
  tz: string;
  snapshot_date: string;
  date?: string;
  replayed: boolean;
  snapshot_id: string;
  details?: {
    cores?: Array<{ key?: string; status?: number; code?: string; error?: string; ms?: number; rid?: string }>;
    selected_core_keys?: string[];
    disabled_reasons?: string[];
    evaluated_flags?: Record<string, unknown>;
  };
  snapshot: {
    headline: {
      deficit_total_missing_qty: number;
      picking_confirmed_events: number;
      inventory_moves_qty: number;
      incidents_open_now: number;
      shipments_open_now: number;
      locks_active_total: number;
    };
    top: {
      deficit_top_short_skus: Array<{ sku_id: string; missing_qty: number }>;
      inventory_low_stock: Array<{ sku_id: string; location_id?: string; available_qty: number }>;
      locks_sample: Array<{ lock_key: string; expires_at?: string }>;
    };
    tomorrow_load: {
      picking_open_lists: number;
      stations: {
        packaging_queue?: number | null;
        labeling_queue?: number | null;
        assembly_queue?: number | null;
        qc_queue?: number | null;
      };
      risk_flags: string[];
    };
    notes: string;
    sections?: {
      daily_summary?: Record<string, unknown> | null;
      control_tower?: Record<string, unknown> | null;
    };
    errors?: Array<{ key: string; status: number; code: string; error: string; ms?: number; rid?: string }>;
  };
};

type EodResult = { ok: true; data: EodSnapshotPayload } | ({ ok: false } & ParsedGasError);

function normalizeError(error: unknown, fallback: string): ParsedGasError {
  const parsed = parseErrorPayload(error);
  return {
    ...parsed,
    error: parsed.error || fallback,
  };
}

export async function upsertEodSnapshot(
  requestId: string,
  payload: { date?: string | null; tz: string; days_window?: number }
): Promise<EodResult> {
  const response = await callGas<EodSnapshotPayload>("eod.snapshot.upsert", payload, requestId, {
    timeoutMs: 25_000,
    retries: 1,
    retryBackoffMs: 500,
  });

  if (!response.ok || !response.data) {
    return {
      ok: false,
      ...normalizeError(response.error, "Failed to generate EOD snapshot"),
    };
  }

  return { ok: true, data: response.data };
}

export async function getEodSnapshot(requestId: string, payload: { date: string; tz: string }): Promise<EodResult> {
  const response = await callGas<EodSnapshotPayload>("eod.snapshot.get", payload, requestId, {
    timeoutMs: 15_000,
    retries: 0,
  });

  if (!response.ok || !response.data) {
    return {
      ok: false,
      ...normalizeError(response.error, "Failed to read EOD snapshot"),
    };
  }

  return { ok: true, data: response.data };
}

import { parseErrorPayload, type ParsedGasError } from "@/lib/api/gasError";
import { callGas } from "@/lib/integrations/gasClient";

export type ControlTowerSnapshot = {
  ok: true;
  generated_at: string;
  sections: {
    deficit: Record<string, unknown>;
    shipments_readiness: Array<Record<string, unknown>>;
    inventory: {
      top_available: Array<Record<string, unknown>>;
      top_reserved: Array<Record<string, unknown>>;
      low_stock: Array<Record<string, unknown>>;
      updated_at_max: string | null;
    };
    picking: {
      open_lists: number;
      open_lines: number | null;
      last_created_at: string | null;
    };
    incidents: {
      open_total: number;
      by_severity: { low: number; medium: number; high: number; critical: number };
      by_zone: Record<string, number>;
    };
    locks: {
      active_total: number;
      by_entity_type: Record<string, number>;
      sample: Array<Record<string, unknown>>;
    };
    recent_events: Array<Record<string, unknown>>;
  };
};

type ControlTowerResult =
  | { ok: true; data: ControlTowerSnapshot }
  | ({ ok: false } & ParsedGasError);

function normalizeError(error: unknown, fallback: string): ParsedGasError {
  const parsed = parseErrorPayload(error);
  return {
    ...parsed,
    error: parsed.error || fallback,
  };
}

export async function getControlTowerSnapshot(requestId: string): Promise<ControlTowerResult> {
  const response = await callGas<ControlTowerSnapshot>("control_tower.read", {}, requestId, {
    timeoutMs: 25_000,
    retries: 1,
    retryBackoffMs: 500,
  });

  if (!response.ok || !response.data) {
    return {
      ok: false,
      ...normalizeError(response.error, "Failed to read control tower snapshot"),
    };
  }

  return { ok: true, data: response.data };
}

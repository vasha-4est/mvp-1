import { parseErrorPayload, type ParsedGasError } from "@/lib/api/gasError";
import { callGas } from "@/lib/integrations/gasClient";

type DeficitSku = {
  sku_id: string;
  missing_qty: number;
};

export type DeficitPayload = {
  ok: true;
  generated_at: string;
  deficit: {
    total_missing_qty: number;
    top_short_skus: DeficitSku[];
    picking: {
      open_lists: number;
      open_lines: number;
      total_short_qty: number;
    };
    shipments: {
      open_shipments: number;
      open_lines: number;
      total_missing_qty: number;
    };
  };
  incidents: {
    open_total: number;
    by_zone: Record<string, number>;
  };
};

type DeficitResultOk = {
  ok: true;
  data: DeficitPayload;
};

type DeficitResultError = {
  ok: false;
} & ParsedGasError;

export type GetDeficitResult = DeficitResultOk | DeficitResultError;

type GasDeficitResponse = {
  ok?: unknown;
  generated_at?: unknown;
  deficit?: unknown;
  incidents?: unknown;
};

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function num(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function normalizeTopSkus(value: unknown): DeficitSku[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      const row = toRecord(item);
      const skuId = str(row.sku_id);
      if (!skuId) return null;
      return {
        sku_id: skuId,
        missing_qty: num(row.missing_qty),
      };
    })
    .filter((item): item is DeficitSku => item !== null);
}

function normalizeByZone(value: unknown): Record<string, number> {
  const record = toRecord(value);
  const out: Record<string, number> = {};

  for (const [key, raw] of Object.entries(record)) {
    out[key] = num(raw);
  }

  return out;
}

function normalizeDeficit(payload: GasDeficitResponse): DeficitPayload {
  const deficit = toRecord(payload.deficit);
  const picking = toRecord(deficit.picking);
  const shipments = toRecord(deficit.shipments);
  const incidents = toRecord(payload.incidents);

  return {
    ok: true,
    generated_at: str(payload.generated_at) || new Date(0).toISOString(),
    deficit: {
      total_missing_qty: num(deficit.total_missing_qty),
      top_short_skus: normalizeTopSkus(deficit.top_short_skus),
      picking: {
        open_lists: num(picking.open_lists),
        open_lines: num(picking.open_lines),
        total_short_qty: num(picking.total_short_qty),
      },
      shipments: {
        open_shipments: num(shipments.open_shipments),
        open_lines: num(shipments.open_lines),
        total_missing_qty: num(shipments.total_missing_qty),
      },
    },
    incidents: {
      open_total: num(incidents.open_total),
      by_zone: normalizeByZone(incidents.by_zone),
    },
  };
}

export async function getDeficitKpi(
  requestId: string,
  payload: { limit_shipments: number; limit_picking: number }
): Promise<GetDeficitResult> {
  const response = await callGas<GasDeficitResponse>("kpi.deficit.get", payload, requestId);

  if (!response.ok) {
    return {
      ok: false,
      ...parseErrorPayload((response as { error?: unknown }).error),
    };
  }

  return {
    ok: true,
    data: normalizeDeficit(response.data ?? {}),
  };
}

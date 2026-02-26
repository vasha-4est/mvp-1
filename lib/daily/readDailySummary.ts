import { parseErrorPayload, type ParsedGasError } from "@/lib/api/gasError";
import { callGas } from "@/lib/integrations/gasClient";

export type DailySummaryPayload = {
  ok: true;
  generated_at: string;
  tz: string;
  window: {
    from_date: string;
    to_date: string;
  };
  days: Array<{
    date: string;
    metrics: {
      inventory_moves_qty: number;
      inventory_moves_count: number;
      incidents_opened: number;
      incidents_closed: number;
      incidents_open_now: number;
      picking_confirmed_events: number;
      batches_created_events: number;
    };
    highlights: {
      top_incident_zones: Array<{ zone: string; count: number }>;
      top_moved_skus: Array<{ sku_id: string; qty: number }>;
    };
  }>;
  now: {
    open_incidents: number;
    open_incidents_by_severity: { low: number; medium: number; high: number; critical: number };
    shipments_open: number;
    picking_open_lists: number;
  };
};

type DailySummaryResultOk = {
  ok: true;
  data: DailySummaryPayload;
};

type DailySummaryResultError = {
  ok: false;
} & ParsedGasError;

export type GetDailySummaryResult = DailySummaryResultOk | DailySummaryResultError;

type GasDailySummaryResponse = Partial<DailySummaryPayload>;

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

function normalizeDay(day: unknown): DailySummaryPayload["days"][number] | null {
  const row = toRecord(day);
  const metrics = toRecord(row.metrics);
  const highlights = toRecord(row.highlights);
  const topZonesRaw = Array.isArray(highlights.top_incident_zones) ? highlights.top_incident_zones : [];
  const topSkusRaw = Array.isArray(highlights.top_moved_skus) ? highlights.top_moved_skus : [];

  const date = str(row.date);
  if (!date) return null;

  return {
    date,
    metrics: {
      inventory_moves_qty: num(metrics.inventory_moves_qty),
      inventory_moves_count: num(metrics.inventory_moves_count),
      incidents_opened: num(metrics.incidents_opened),
      incidents_closed: num(metrics.incidents_closed),
      incidents_open_now: num(metrics.incidents_open_now),
      picking_confirmed_events: num(metrics.picking_confirmed_events),
      batches_created_events: num(metrics.batches_created_events),
    },
    highlights: {
      top_incident_zones: topZonesRaw
        .map((item) => {
          const zone = toRecord(item);
          const zoneName = str(zone.zone);
          if (!zoneName) return null;
          return { zone: zoneName, count: num(zone.count) };
        })
        .filter((item): item is { zone: string; count: number } => item !== null),
      top_moved_skus: topSkusRaw
        .map((item) => {
          const sku = toRecord(item);
          const skuId = str(sku.sku_id);
          if (!skuId) return null;
          return { sku_id: skuId, qty: num(sku.qty) };
        })
        .filter((item): item is { sku_id: string; qty: number } => item !== null),
    },
  };
}

function normalizePayload(payload: GasDailySummaryResponse): DailySummaryPayload {
  const window = toRecord(payload.window);
  const now = toRecord(payload.now);
  const severity = toRecord(now.open_incidents_by_severity);
  const daysRaw = Array.isArray(payload.days) ? payload.days : [];

  return {
    ok: true,
    generated_at: str(payload.generated_at) || new Date(0).toISOString(),
    tz: str(payload.tz) || "UTC",
    window: {
      from_date: str(window.from_date),
      to_date: str(window.to_date),
    },
    days: daysRaw.map(normalizeDay).filter((item): item is DailySummaryPayload["days"][number] => item !== null),
    now: {
      open_incidents: num(now.open_incidents),
      open_incidents_by_severity: {
        low: num(severity.low),
        medium: num(severity.medium),
        high: num(severity.high),
        critical: num(severity.critical),
      },
      shipments_open: num(now.shipments_open),
      picking_open_lists: num(now.picking_open_lists),
    },
  };
}

export async function getDailySummary(
  requestId: string,
  payload: { days: number; tz?: string }
): Promise<GetDailySummaryResult> {
  const response = await callGas<GasDailySummaryResponse>("daily.summary.get", payload, requestId);

  if (!response.ok) {
    return {
      ok: false,
      ...parseErrorPayload((response as { error?: unknown }).error),
    };
  }

  return {
    ok: true,
    data: normalizePayload(response.data ?? {}),
  };
}

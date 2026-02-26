import { parseErrorPayload, type ParsedGasError } from "@/lib/api/gasError";
import { callGas } from "@/lib/integrations/gasClient";

export type ShipmentSlaSeriesItem = {
  date: string;
  metrics: {
    shipments_created: number;
    shipments_ready: number;
    shipments_ready_on_time: number;
    shipments_ready_late: number;
    shipments_open_now: number;
    avg_ready_hours: number;
    p95_ready_hours: number;
  };
};

export type ShipmentSlaPayload = {
  ok: true;
  generated_at: string;
  tz: string;
  window: { from_date: string; to_date: string; days: number };
  sla_hours: number;
  series: ShipmentSlaSeriesItem[];
  notes: {
    source: string;
    definition: string;
    count_skipped: number;
  };
};

type ResultOk = { ok: true; data: ShipmentSlaPayload };
type ResultError = { ok: false } & ParsedGasError;
export type GetShipmentSlaResult = ResultOk | ResultError;

type GasResponse = {
  generated_at?: unknown;
  tz?: unknown;
  window?: unknown;
  sla_hours?: unknown;
  series?: unknown;
  notes?: unknown;
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

function rec(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function normalize(payload: GasResponse): ShipmentSlaPayload {
  const window = rec(payload.window);
  const notes = rec(payload.notes);

  return {
    ok: true,
    generated_at: str(payload.generated_at) || new Date(0).toISOString(),
    tz: str(payload.tz) || "Europe/Moscow",
    window: {
      from_date: str(window.from_date),
      to_date: str(window.to_date),
      days: num(window.days),
    },
    sla_hours: num(payload.sla_hours),
    series: Array.isArray(payload.series)
      ? payload.series
          .map((item) => {
            const row = rec(item);
            const metrics = rec(row.metrics);
            const date = str(row.date);
            if (!date) return null;

            return {
              date,
              metrics: {
                shipments_created: num(metrics.shipments_created),
                shipments_ready: num(metrics.shipments_ready),
                shipments_ready_on_time: num(metrics.shipments_ready_on_time),
                shipments_ready_late: num(metrics.shipments_ready_late),
                shipments_open_now: num(metrics.shipments_open_now),
                avg_ready_hours: num(metrics.avg_ready_hours),
                p95_ready_hours: num(metrics.p95_ready_hours),
              },
            };
          })
          .filter((item): item is ShipmentSlaSeriesItem => item !== null)
      : [],
    notes: {
      source: str(notes.source),
      definition: str(notes.definition),
      count_skipped: num(notes.count_skipped),
    },
  };
}

export async function getShipmentSlaKpi(
  requestId: string,
  payload: { days: number; tz: string; sla_hours: number }
): Promise<GetShipmentSlaResult> {
  const response = await callGas<GasResponse>("kpi.shipment.sla.get", payload, requestId);

  if (!response.ok) {
    return { ok: false, ...parseErrorPayload((response as { error?: unknown }).error) };
  }

  return { ok: true, data: normalize(response.data ?? {}) };
}

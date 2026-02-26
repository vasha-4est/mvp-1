import { parseErrorPayload, type ParsedGasError } from "@/lib/api/gasError";
import { callGas } from "@/lib/integrations/gasClient";

export type ShipmentsSlaSeriesItem = {
  date: string;
  metrics: {
    shipments_open: number;
    shipments_dispatched: number;
    avg_ready_to_dispatch_minutes: number | null;
    p90_ready_to_dispatch_minutes: number | null;
    overdue_shipments: number;
  };
};

export type ShipmentsSlaPayload = {
  ok: true;
  generated_at: string;
  tz: string;
  window: { from_date: string; to_date: string };
  series: ShipmentsSlaSeriesItem[];
  definitions: {
    ready_timestamp_source: string;
    dispatched_event: string;
    overdue_threshold_minutes: number;
  };
};

type ResultOk = { ok: true; data: ShipmentsSlaPayload };
type ResultError = { ok: false } & ParsedGasError;
export type GetShipmentsSlaResult = ResultOk | ResultError;

type GasResponse = {
  generated_at?: unknown;
  tz?: unknown;
  window?: unknown;
  series?: unknown;
  definitions?: unknown;
};

const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const rec = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

function num(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function nullableNum(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalize(payload: GasResponse): ShipmentsSlaPayload {
  const window = rec(payload.window);
  const definitions = rec(payload.definitions);

  return {
    ok: true,
    generated_at: str(payload.generated_at) || new Date(0).toISOString(),
    tz: str(payload.tz) || "Europe/Moscow",
    window: {
      from_date: str(window.from_date),
      to_date: str(window.to_date),
    },
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
                shipments_open: num(metrics.shipments_open),
                shipments_dispatched: num(metrics.shipments_dispatched),
                avg_ready_to_dispatch_minutes: nullableNum(metrics.avg_ready_to_dispatch_minutes),
                p90_ready_to_dispatch_minutes: nullableNum(metrics.p90_ready_to_dispatch_minutes),
                overdue_shipments: num(metrics.overdue_shipments),
              },
            };
          })
          .filter((item): item is ShipmentsSlaSeriesItem => item !== null)
      : [],
    definitions: {
      ready_timestamp_source: str(definitions.ready_timestamp_source),
      dispatched_event: str(definitions.dispatched_event) || "ship_dispatched",
      overdue_threshold_minutes: num(definitions.overdue_threshold_minutes),
    },
  };
}

export async function getShipmentsSlaKpi(
  requestId: string,
  payload: { days: number; tz: string; overdue_threshold_minutes?: number }
): Promise<GetShipmentsSlaResult> {
  const response = await callGas<GasResponse>("kpi.shipments.sla.get", payload, requestId);

  if (!response.ok) {
    return { ok: false, ...parseErrorPayload((response as { error?: unknown }).error) };
  }

  return { ok: true, data: normalize(response.data ?? {}) };
}

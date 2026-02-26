import { parseErrorPayload, type ParsedGasError } from "@/lib/api/gasError";
import { callGas } from "@/lib/integrations/gasClient";

export type ThroughputShiftMetrics = {
  inventory_moves_qty: number;
  inventory_moves_count: number;
  picking_confirmed_lines: number;
  batches_created: number;
  incidents_opened: number;
  incidents_closed: number;
};

export type ThroughputShiftDefinition = {
  key: string;
  title: string;
  start: string;
  end: string;
};

export type ThroughputShiftSeriesItem = {
  date: string;
  shift_key: string;
  metrics: ThroughputShiftMetrics;
};

export type ThroughputShiftsPayload = {
  ok: true;
  generated_at: string;
  tz: string;
  window: { from_date: string; to_date: string };
  shifts: ThroughputShiftDefinition[];
  series: ThroughputShiftSeriesItem[];
};

type ResultOk = { ok: true; data: ThroughputShiftsPayload };
type ResultError = { ok: false } & ParsedGasError;
export type GetThroughputShiftsResult = ResultOk | ResultError;

type GasResponse = {
  generated_at?: unknown;
  tz?: unknown;
  window?: unknown;
  shifts?: unknown;
  series?: unknown;
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

function normalizeMetrics(value: unknown): ThroughputShiftMetrics {
  const row = rec(value);
  return {
    inventory_moves_qty: num(row.inventory_moves_qty),
    inventory_moves_count: num(row.inventory_moves_count),
    picking_confirmed_lines: num(row.picking_confirmed_lines),
    batches_created: num(row.batches_created),
    incidents_opened: num(row.incidents_opened),
    incidents_closed: num(row.incidents_closed),
  };
}

function normalize(payload: GasResponse): ThroughputShiftsPayload {
  const window = rec(payload.window);

  return {
    ok: true,
    generated_at: str(payload.generated_at) || new Date(0).toISOString(),
    tz: str(payload.tz) || "Europe/Moscow",
    window: {
      from_date: str(window.from_date),
      to_date: str(window.to_date),
    },
    shifts: Array.isArray(payload.shifts)
      ? payload.shifts
          .map((item) => {
            const row = rec(item);
            const key = str(row.key);
            if (!key) return null;
            return {
              key,
              title: str(row.title),
              start: str(row.start),
              end: str(row.end),
            };
          })
          .filter((item): item is ThroughputShiftDefinition => item !== null)
      : [],
    series: Array.isArray(payload.series)
      ? payload.series
          .map((item) => {
            const row = rec(item);
            const date = str(row.date);
            const shiftKey = str(row.shift_key);
            if (!date || !shiftKey) return null;
            return {
              date,
              shift_key: shiftKey,
              metrics: normalizeMetrics(row.metrics),
            };
          })
          .filter((item): item is ThroughputShiftSeriesItem => item !== null)
      : [],
  };
}

export async function getThroughputShiftsKpi(
  requestId: string,
  payload: { days: number; tz: string; shifts?: Array<{ key: string; title: string; start: string; end: string }> }
): Promise<GetThroughputShiftsResult> {
  const response = await callGas<GasResponse>("kpi.throughput.shifts.get", payload, requestId);

  if (!response.ok) {
    return { ok: false, ...parseErrorPayload((response as { error?: unknown }).error) };
  }

  return { ok: true, data: normalize(response.data ?? {}) };
}

import { parseErrorPayload, type ParsedGasError } from "@/lib/api/gasError";
import { callGas } from "@/lib/integrations/gasClient";

export type ThroughputMetrics = {
  inventory_moves_qty: number;
  inventory_moves_count: number;
  incidents_opened: number;
  incidents_closed: number;
  picking_confirmed_lines: number;
  batches_created: number;
};

export type ThroughputSeriesItem = {
  date: string;
  metrics: ThroughputMetrics;
};

export type ThroughputPayload = {
  ok: true;
  generated_at: string;
  from_date: string;
  to_date: string;
  tz: string;
  series: ThroughputSeriesItem[];
  totals: ThroughputMetrics;
};

type ThroughputResultOk = {
  ok: true;
  data: ThroughputPayload;
};

type ThroughputResultError = {
  ok: false;
} & ParsedGasError;

export type GetThroughputResult = ThroughputResultOk | ThroughputResultError;

type GasThroughputResponse = {
  ok?: unknown;
  generated_at?: unknown;
  from_date?: unknown;
  to_date?: unknown;
  tz?: unknown;
  series?: unknown;
  totals?: unknown;
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

function normalizeMetrics(value: unknown): ThroughputMetrics {
  const row = toRecord(value);
  return {
    inventory_moves_qty: num(row.inventory_moves_qty),
    inventory_moves_count: num(row.inventory_moves_count),
    incidents_opened: num(row.incidents_opened),
    incidents_closed: num(row.incidents_closed),
    picking_confirmed_lines: num(row.picking_confirmed_lines),
    batches_created: num(row.batches_created),
  };
}

function normalizeSeries(value: unknown): ThroughputSeriesItem[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      const row = toRecord(item);
      const date = str(row.date);
      if (!date) return null;

      return {
        date,
        metrics: normalizeMetrics(row.metrics),
      };
    })
    .filter((item): item is ThroughputSeriesItem => item !== null);
}

function normalizeThroughput(payload: GasThroughputResponse): ThroughputPayload {
  return {
    ok: true,
    generated_at: str(payload.generated_at) || new Date(0).toISOString(),
    from_date: str(payload.from_date),
    to_date: str(payload.to_date),
    tz: str(payload.tz) || "UTC",
    series: normalizeSeries(payload.series),
    totals: normalizeMetrics(payload.totals),
  };
}

export async function getThroughputKpi(requestId: string, payload: { days: number; tz: string }): Promise<GetThroughputResult> {
  const response = await callGas<GasThroughputResponse>("kpi.throughput.get", payload, requestId);

  if (!response.ok) {
    return {
      ok: false,
      ...parseErrorPayload((response as { error?: unknown }).error),
    };
  }

  return {
    ok: true,
    data: normalizeThroughput(response.data ?? {}),
  };
}

import { parseErrorPayload } from "@/lib/api/gasError";
import { getDailySummary } from "@/lib/daily/readDailySummary";
import { callGasRead } from "@/lib/integrations/gasRead";
import { getDeficitKpi } from "@/lib/kpi/readDeficit";
import { getShipmentSlaKpi } from "@/lib/kpi/readShipmentSla";
import { getThroughputShiftsKpi } from "@/lib/kpi/readThroughputShifts";
import { getThroughputKpi } from "@/lib/kpi/readThroughput";

const DEFAULT_LIMIT_SHIPMENTS = 10;
const DEFAULT_LIMIT_PICKING = 50;

const KPI_KEYS = ["deficit", "throughput", "throughput_shifts", "shipment_sla", "daily_summary"] as const;

type KpiKey = (typeof KPI_KEYS)[number];
type KpiStatus = "ok" | "warn" | "alert" | "unknown";
type ThresholdDirection = "gt" | "lt";

type ThresholdRow = {
  kpi_key: string;
  warn: number | null;
  alert: number | null;
  direction: ThresholdDirection | null;
  metric_name: string | null;
  unit: string | null;
};

type ThresholdsByKpi = Partial<Record<KpiKey, ThresholdRow>>;

type ThresholdsReadResult =
  | { ok: true; thresholds: ThresholdsByKpi }
  | { ok: false; error: string; code: string; details?: Record<string, unknown> };

type AlertItem = {
  kpi_key: KpiKey;
  status: KpiStatus;
  value: number | null;
  unit: string | null;
  thresholds: { warn?: number; alert?: number; direction?: ThresholdDirection } | null;
  details: Record<string, unknown>;
};

export type KpiAlertsPayload = {
  ok: true;
  generated_at: string;
  tz: string;
  params: {
    days: number;
    sla_hours: number;
  };
  items: AlertItem[];
};

export type GetKpiAlertsResult =
  | { ok: true; data: KpiAlertsPayload }
  | ({ ok: false } & ReturnType<typeof parseErrorPayload>);

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function rec(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function normalizeThresholdRow(value: unknown): ThresholdRow | null {
  const row = rec(value);
  const kpiKey = str(row.kpi_key).toLowerCase() as KpiKey;
  if (!KPI_KEYS.includes(kpiKey)) return null;

  const directionRaw = str(row.direction).toLowerCase();
  const direction: ThresholdDirection | null = directionRaw === "gt" || directionRaw === "lt" ? directionRaw : null;

  return {
    kpi_key: kpiKey,
    warn: numOrNull(row.warn),
    alert: numOrNull(row.alert),
    direction,
    metric_name: str(row.metric_name) || null,
    unit: str(row.unit) || null,
  };
}

function evaluateStatus(value: number | null, threshold: ThresholdRow | undefined): KpiStatus {
  if (value === null || !threshold || !threshold.direction || threshold.warn === null || threshold.alert === null) {
    return "unknown";
  }

  if (threshold.direction === "gt") {
    if (value >= threshold.alert) return "alert";
    if (value >= threshold.warn) return "warn";
    return "ok";
  }

  if (value <= threshold.alert) return "alert";
  if (value <= threshold.warn) return "warn";
  return "ok";
}

async function readThresholds(requestId: string): Promise<ThresholdsReadResult> {
  const response = await callGasRead<{ rows?: unknown }>("control_model.kpi_thresholds.read", {}, requestId);
  if (!response.ok) {
    const parsed = parseErrorPayload((response as { error?: unknown }).error);
    return { ok: false, ...parsed };
  }

  const rows = Array.isArray(response.data?.rows)
    ? response.data.rows
    : Array.isArray(response.data)
      ? response.data
      : [];

  const thresholds: ThresholdsByKpi = {};
  for (const row of rows) {
    const normalized = normalizeThresholdRow(row);
    if (!normalized) continue;

    thresholds[normalized.kpi_key as KpiKey] = normalized;
  }

  return { ok: true, thresholds };
}

function thresholdPayload(threshold: ThresholdRow | undefined): AlertItem["thresholds"] {
  if (!threshold) return null;

  const out: AlertItem["thresholds"] = {};
  if (threshold.warn !== null) out.warn = threshold.warn;
  if (threshold.alert !== null) out.alert = threshold.alert;
  if (threshold.direction) out.direction = threshold.direction;
  return Object.keys(out).length > 0 ? out : null;
}

export async function getKpiAlerts(
  requestId: string,
  params: { days: number; tz: string; sla_hours: number }
): Promise<GetKpiAlertsResult> {
  const thresholdsResult = await readThresholds(requestId);
  const thresholds = thresholdsResult.ok ? thresholdsResult.thresholds : {};

  const items: AlertItem[] = [];

  const deficitItem = await (async (): Promise<AlertItem> => {
    try {
      const result = await getDeficitKpi(requestId, {
        limit_shipments: DEFAULT_LIMIT_SHIPMENTS,
        limit_picking: DEFAULT_LIMIT_PICKING,
      });

      if (result.ok === false) {
        return {
          kpi_key: "deficit",
          status: "unknown",
          value: null,
          unit: thresholds.deficit?.unit ?? null,
          thresholds: thresholdPayload(thresholds.deficit),
          details: { error: result.error, code: result.code },
        };
      }

      const value = result.data.deficit.total_missing_qty;
      return {
        kpi_key: "deficit",
        status: evaluateStatus(value, thresholds.deficit),
        value,
        unit: thresholds.deficit?.unit ?? null,
        thresholds: thresholdPayload(thresholds.deficit),
        details: {
          generated_at: result.data.generated_at,
        },
      };
    } catch (error) {
      return {
        kpi_key: "deficit",
        status: "unknown",
        value: null,
        unit: thresholds.deficit?.unit ?? null,
        thresholds: thresholdPayload(thresholds.deficit),
        details: { error: error instanceof Error ? error.message : "Failed to compute deficit" },
      };
    }
  })();
  items.push(deficitItem);

  const throughputItem = await (async (): Promise<AlertItem> => {
    try {
      const result = await getThroughputKpi(requestId, { days: params.days, tz: params.tz });
      const threshold = thresholds.throughput;
      const metricName = threshold?.metric_name || "picking_confirmed_lines";

      if (result.ok === false) {
        return {
          kpi_key: "throughput",
          status: "unknown",
          value: null,
          unit: threshold?.unit ?? null,
          thresholds: thresholdPayload(threshold),
          details: { error: result.error, code: result.code, metric_name: metricName },
        };
      }

      const latest = result.data.series.at(-1);
      const latestMetrics = latest?.metrics as Record<string, unknown> | undefined;
      const value = latestMetrics ? numOrNull(latestMetrics[metricName]) : null;

      return {
        kpi_key: "throughput",
        status: evaluateStatus(value, threshold),
        value,
        unit: threshold?.unit ?? null,
        thresholds: thresholdPayload(threshold),
        details: {
          metric_name: metricName,
          date: latest?.date ?? null,
          generated_at: result.data.generated_at,
        },
      };
    } catch (error) {
      return {
        kpi_key: "throughput",
        status: "unknown",
        value: null,
        unit: thresholds.throughput?.unit ?? null,
        thresholds: thresholdPayload(thresholds.throughput),
        details: { error: error instanceof Error ? error.message : "Failed to compute throughput" },
      };
    }
  })();
  items.push(throughputItem);

  const shiftsItem = await (async (): Promise<AlertItem> => {
    try {
      const result = await getThroughputShiftsKpi(requestId, { days: params.days, tz: params.tz });
      const threshold = thresholds.throughput_shifts;
      const metricName = threshold?.metric_name || "picking_confirmed_lines";

      if (result.ok === false) {
        return {
          kpi_key: "throughput_shifts",
          status: "unknown",
          value: null,
          unit: threshold?.unit ?? null,
          thresholds: thresholdPayload(threshold),
          details: { error: result.error, code: result.code, metric_name: metricName },
        };
      }

      const latest = result.data.grouped_series.at(-1);
      const total = latest
        ? Object.values(latest.shifts).reduce((sum, shift) => {
            const metrics = shift.metrics as Record<string, unknown>;
            return sum + (numOrNull(metrics[metricName]) ?? 0);
          }, 0)
        : null;

      const value = latest ? total : null;

      return {
        kpi_key: "throughput_shifts",
        status: evaluateStatus(value, threshold),
        value,
        unit: threshold?.unit ?? null,
        thresholds: thresholdPayload(threshold),
        details: {
          metric_name: metricName,
          date: latest?.date ?? null,
          generated_at: result.data.generated_at,
        },
      };
    } catch (error) {
      return {
        kpi_key: "throughput_shifts",
        status: "unknown",
        value: null,
        unit: thresholds.throughput_shifts?.unit ?? null,
        thresholds: thresholdPayload(thresholds.throughput_shifts),
        details: { error: error instanceof Error ? error.message : "Failed to compute throughput shifts" },
      };
    }
  })();
  items.push(shiftsItem);

  const shipmentSlaItem = await (async (): Promise<AlertItem> => {
    try {
      const result = await getShipmentSlaKpi(requestId, { days: params.days, tz: params.tz, sla_hours: params.sla_hours });
      const threshold = thresholds.shipment_sla;
      const metricName = threshold?.metric_name || "shipments_ready_late";

      if (result.ok === false) {
        return {
          kpi_key: "shipment_sla",
          status: "unknown",
          value: null,
          unit: threshold?.unit ?? null,
          thresholds: thresholdPayload(threshold),
          details: { error: result.error, code: result.code, metric_name: metricName },
        };
      }

      const latest = result.data.series.at(-1);
      const metrics = latest?.metrics as Record<string, unknown> | undefined;
      const shipmentsReady = metrics ? numOrNull(metrics.shipments_ready) ?? 0 : 0;
      const shipmentsReadyOnTime = metrics ? numOrNull(metrics.shipments_ready_on_time) ?? 0 : 0;

      const value = metricName === "on_time_rate" && shipmentsReady > 0
        ? Number(((shipmentsReadyOnTime / shipmentsReady) * 100).toFixed(2))
        : metrics
          ? numOrNull(metrics[metricName])
          : null;

      return {
        kpi_key: "shipment_sla",
        status: evaluateStatus(value, threshold),
        value,
        unit: threshold?.unit ?? null,
        thresholds: thresholdPayload(threshold),
        details: {
          metric_name: metricName,
          date: latest?.date ?? null,
          generated_at: result.data.generated_at,
        },
      };
    } catch (error) {
      return {
        kpi_key: "shipment_sla",
        status: "unknown",
        value: null,
        unit: thresholds.shipment_sla?.unit ?? null,
        thresholds: thresholdPayload(thresholds.shipment_sla),
        details: { error: error instanceof Error ? error.message : "Failed to compute shipment_sla" },
      };
    }
  })();
  items.push(shipmentSlaItem);

  const dailySummaryItem = await (async (): Promise<AlertItem> => {
    try {
      const result = await getDailySummary(requestId, { days: Math.min(params.days, 7), tz: params.tz });
      const threshold = thresholds.daily_summary;

      if (result.ok === false) {
        return {
          kpi_key: "daily_summary",
          status: "unknown",
          value: null,
          unit: threshold?.unit ?? null,
          thresholds: thresholdPayload(threshold),
          details: { error: result.error, code: result.code },
        };
      }

      const value = result.data.now.open_incidents;
      return {
        kpi_key: "daily_summary",
        status: evaluateStatus(value, threshold),
        value,
        unit: threshold?.unit ?? null,
        thresholds: thresholdPayload(threshold),
        details: {
          generated_at: result.data.generated_at,
        },
      };
    } catch (error) {
      return {
        kpi_key: "daily_summary",
        status: "unknown",
        value: null,
        unit: thresholds.daily_summary?.unit ?? null,
        thresholds: thresholdPayload(thresholds.daily_summary),
        details: { error: error instanceof Error ? error.message : "Failed to compute daily_summary" },
      };
    }
  })();
  items.push(dailySummaryItem);

  if (thresholdsResult.ok === false) {
    for (const item of items) {
      item.details.thresholds_error = {
        code: thresholdsResult.code,
        error: thresholdsResult.error,
        ...(thresholdsResult.details ? { details: thresholdsResult.details } : {}),
      };
    }
  }

  return {
    ok: true,
    data: {
      ok: true,
      generated_at: new Date().toISOString(),
      tz: params.tz,
      params: {
        days: params.days,
        sla_hours: params.sla_hours,
      },
      items,
    },
  };
}

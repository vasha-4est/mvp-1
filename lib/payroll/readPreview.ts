import { parseErrorPayload, type ParsedGasError } from "@/lib/api/gasError";
import { callGasRead } from "@/lib/integrations/gasRead";

export type PayrollPreviewPayload = {
  ok: true;
  generated_at: string;
  tz: string;
  window: { from_date: string; to_date: string; days: number };
  shifts: Array<{ key: "shift_1" | "shift_2" | "shift_3"; label?: string }>;
  rates: {
    source: "tariffs" | "defaults";
    currency: string;
    items: Array<{ metric_key: string; rub_per_unit: number }>;
  };
  series: Array<{
    date: string;
    shift_key: "shift_1" | "shift_2" | "shift_3";
    report_present: boolean;
    pay_rub: number;
    reason?: "no_report_no_pay" | null;
    metrics?: Record<string, number>;
    breakdown: {
      items: Array<{ metric_key: string; qty: number; rate_rub: number; amount_rub: number }>;
      total_rub: number;
    };
  }>;
  totals: {
    pay_rub: number;
    shifts_with_reports: number;
    shifts_missing_reports: number;
  };
};

type ResultOk = { ok: true; data: PayrollPreviewPayload };
type ResultError = { ok: false } & ParsedGasError;
export type GetPayrollPreviewResult = ResultOk | ResultError;

type GasPayrollPreview = Partial<PayrollPreviewPayload>;

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

function shiftKey(value: unknown): "shift_1" | "shift_2" | "shift_3" {
  const key = str(value);
  if (key === "shift_2") return "shift_2";
  if (key === "shift_3") return "shift_3";
  return "shift_1";
}

function normalize(payload: GasPayrollPreview): PayrollPreviewPayload {
  const window = rec(payload.window);
  const rates = rec(payload.rates);
  const totals = rec(payload.totals);

  return {
    ok: true,
    generated_at: str(payload.generated_at) || new Date(0).toISOString(),
    tz: str(payload.tz) || "Europe/Moscow",
    window: {
      from_date: str(window.from_date),
      to_date: str(window.to_date),
      days: num(window.days),
    },
    shifts: Array.isArray(payload.shifts)
      ? payload.shifts
          .map((item) => {
            const row = rec(item);
            return { key: shiftKey(row.key), label: str(row.label) || undefined };
          })
          .filter((item, idx, arr) => arr.findIndex((x) => x.key === item.key) === idx)
      : [],
    rates: {
      source: rates.source === "tariffs" ? "tariffs" : "defaults",
      currency: str(rates.currency) || "RUB",
      items: Array.isArray(rates.items)
        ? rates.items.map((item) => {
            const row = rec(item);
            return {
              metric_key: str(row.metric_key),
              rub_per_unit: num(row.rub_per_unit),
            };
          })
        : [],
    },
    series: Array.isArray(payload.series)
      ? payload.series.map((item) => {
          const row = rec(item);
          const breakdown = rec(row.breakdown);
          const metricsRaw = rec(row.metrics);
          const metrics: Record<string, number> = {};
          for (const key of Object.keys(metricsRaw)) {
            metrics[key] = num(metricsRaw[key]);
          }

          return {
            date: str(row.date),
            shift_key: shiftKey(row.shift_key),
            report_present: Boolean(row.report_present),
            pay_rub: num(row.pay_rub),
            reason: row.reason === "no_report_no_pay" ? "no_report_no_pay" : null,
            ...(Object.keys(metrics).length > 0 ? { metrics } : {}),
            breakdown: {
              items: Array.isArray(breakdown.items)
                ? breakdown.items.map((part) => {
                    const partRow = rec(part);
                    return {
                      metric_key: str(partRow.metric_key),
                      qty: num(partRow.qty),
                      rate_rub: num(partRow.rate_rub),
                      amount_rub: num(partRow.amount_rub),
                    };
                  })
                : [],
              total_rub: num(breakdown.total_rub),
            },
          };
        })
      : [],
    totals: {
      pay_rub: num(totals.pay_rub),
      shifts_with_reports: num(totals.shifts_with_reports),
      shifts_missing_reports: num(totals.shifts_missing_reports),
    },
  };
}

export async function getPayrollPreview(
  requestId: string,
  payload: { days?: number; tz?: string; from_date?: string; to_date?: string }
): Promise<GetPayrollPreviewResult> {
  const response = await callGasRead<GasPayrollPreview>("payroll.preview.get", payload, requestId);
  if (!response.ok) {
    return { ok: false, ...parseErrorPayload((response as { error?: unknown }).error) };
  }

  return {
    ok: true,
    data: normalize(response.data ?? {}),
  };
}

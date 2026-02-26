"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type ThroughputShiftMetrics = {
  inventory_moves_qty?: number;
  inventory_moves_count?: number;
  picking_confirmed_lines?: number;
  batches_created?: number;
  incidents_opened?: number;
  incidents_closed?: number;
};

type FlatRow = {
  date?: string;
  shift_key?: string;
  metrics?: ThroughputShiftMetrics;
};

type GroupedRow = {
  date?: string;
  shifts?: Record<string, { metrics?: ThroughputShiftMetrics }>;
};

type Shift = { key?: string; title?: string; start?: string; end?: string };

type Payload = {
  ok: true;
  generated_at?: string;
  tz?: string;
  window?: { from_date?: string; to_date?: string };
  shifts?: Shift[];
  series?: FlatRow[];
  grouped_series?: GroupedRow[];
};

type LoadState = { status: "loading" } | { status: "ready"; data: Payload | null; error: string | null };

const DEFAULT_DAYS = 14;
const DEFAULT_TZ = "Europe/Moscow";

const ZERO_METRICS: Required<ThroughputShiftMetrics> = {
  inventory_moves_qty: 0,
  inventory_moves_count: 0,
  picking_confirmed_lines: 0,
  batches_created: 0,
  incidents_opened: 0,
  incidents_closed: 0,
};

function parseDays(raw: string | null): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) return DEFAULT_DAYS;
  return parsed;
}

function normalizeMetrics(metrics: ThroughputShiftMetrics | undefined): Required<ThroughputShiftMetrics> {
  const safe = metrics || {};
  return {
    inventory_moves_qty: typeof safe.inventory_moves_qty === "number" && Number.isFinite(safe.inventory_moves_qty) ? safe.inventory_moves_qty : 0,
    inventory_moves_count:
      typeof safe.inventory_moves_count === "number" && Number.isFinite(safe.inventory_moves_count) ? safe.inventory_moves_count : 0,
    picking_confirmed_lines:
      typeof safe.picking_confirmed_lines === "number" && Number.isFinite(safe.picking_confirmed_lines) ? safe.picking_confirmed_lines : 0,
    batches_created: typeof safe.batches_created === "number" && Number.isFinite(safe.batches_created) ? safe.batches_created : 0,
    incidents_opened: typeof safe.incidents_opened === "number" && Number.isFinite(safe.incidents_opened) ? safe.incidents_opened : 0,
    incidents_closed: typeof safe.incidents_closed === "number" && Number.isFinite(safe.incidents_closed) ? safe.incidents_closed : 0,
  };
}

function formatDateTimeMoscow(value: unknown): string {
  if (typeof value !== "string") return "—";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: DEFAULT_TZ,
  }).format(parsed);
}

function formatNumber(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : "0";
}

function buildGroupedRows(payload: Payload | null): Array<{ date: string; shifts: Record<string, Required<ThroughputShiftMetrics>> }> {
  if (!payload) return [];

  if (Array.isArray(payload.grouped_series) && payload.grouped_series.length > 0) {
    return payload.grouped_series
      .map((row) => {
        const date = String(row.date || "");
        if (!date) return null;

        const shiftsRaw = row.shifts && typeof row.shifts === "object" ? row.shifts : {};
        const shifts: Record<string, Required<ThroughputShiftMetrics>> = {};

        for (const shiftKey of Object.keys(shiftsRaw)) {
          shifts[shiftKey] = normalizeMetrics(shiftsRaw[shiftKey]?.metrics);
        }

        return { date, shifts };
      })
      .filter((row): row is { date: string; shifts: Record<string, Required<ThroughputShiftMetrics>> } => row !== null)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  const grouped: Record<string, Record<string, Required<ThroughputShiftMetrics>>> = {};
  for (const row of payload.series || []) {
    const date = String(row.date || "");
    const shiftKey = String(row.shift_key || "");
    if (!date || !shiftKey) continue;

    if (!grouped[date]) grouped[date] = {};
    grouped[date][shiftKey] = normalizeMetrics(row.metrics);
  }

  return Object.keys(grouped)
    .sort((a, b) => a.localeCompare(b))
    .map((date) => ({ date, shifts: grouped[date] }));
}

function sumMetrics(metricsList: Array<Required<ThroughputShiftMetrics>>): Required<ThroughputShiftMetrics> {
  return metricsList.reduce(
    (acc, m) => ({
      inventory_moves_qty: acc.inventory_moves_qty + m.inventory_moves_qty,
      inventory_moves_count: acc.inventory_moves_count + m.inventory_moves_count,
      picking_confirmed_lines: acc.picking_confirmed_lines + m.picking_confirmed_lines,
      batches_created: acc.batches_created + m.batches_created,
      incidents_opened: acc.incidents_opened + m.incidents_opened,
      incidents_closed: acc.incidents_closed + m.incidents_closed,
    }),
    { ...ZERO_METRICS }
  );
}

function MetricBlock({ metrics }: { metrics: Required<ThroughputShiftMetrics> }) {
  return (
    <div style={{ display: "grid", gap: 2, fontSize: 12 }}>
      <div>Moves qty: <strong>{formatNumber(metrics.inventory_moves_qty)}</strong></div>
      <div>Picking: <strong>{formatNumber(metrics.picking_confirmed_lines)}</strong></div>
      <div>Batches: <strong>{formatNumber(metrics.batches_created)}</strong></div>
      <div>Inc opened: <strong>{formatNumber(metrics.incidents_opened)}</strong></div>
      <div>Inc closed: <strong>{formatNumber(metrics.incidents_closed)}</strong></div>
    </div>
  );
}

export default function ThroughputShiftsKpiView() {
  const searchParams = useSearchParams();
  const days = parseDays(searchParams.get("days"));
  const tz = (searchParams.get("tz") || "").trim() || DEFAULT_TZ;
  const query = useMemo(() => `days=${encodeURIComponent(String(days))}&tz=${encodeURIComponent(tz)}`, [days, tz]);

  const [state, setState] = useState<LoadState>({ status: "loading" });

  const loadData = useCallback(async () => {
    setState({ status: "loading" });

    try {
      const response = await fetch(`/api/kpi/throughput-shifts?${query}`, {
        method: "GET",
        cache: "no-store",
        credentials: "include",
      });

      const payload = (await response.json().catch(() => null)) as Payload | null;

      if (!response.ok) {
        setState({
          status: "ready",
          data: null,
          error: "Could not load throughput-by-shift data. Please try again.",
        });
        return;
      }

      setState({ status: "ready", data: payload, error: null });
    } catch {
      setState({
        status: "ready",
        data: null,
        error: "Could not load throughput-by-shift data. Please try again.",
      });
    }
  }, [query]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const data = state.status === "ready" ? state.data : null;
  const shifts = Array.isArray(data?.shifts) ? data.shifts : [];
  const groupedRows = buildGroupedRows(data);

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Throughput by Shifts</h1>
          <p style={{ margin: "6px 0 0", color: "#4b5563" }}>Moscow-time operational throughput grouped by shifts.</p>
        </div>
        <button type="button" onClick={loadData} disabled={state.status === "loading"}>
          {state.status === "loading" ? "Loading..." : "Refresh"}
        </button>
      </div>

      <div style={{ display: "grid", gap: 6, color: "#4b5563" }}>
        <p style={{ margin: 0 }}><strong>Last updated:</strong> {formatDateTimeMoscow(data?.generated_at)}</p>
        <p style={{ margin: 0 }}><strong>Window:</strong> {data?.window?.from_date || "—"} → {data?.window?.to_date || "—"}</p>
        <p style={{ margin: 0 }}><strong>Timezone:</strong> {data?.tz || tz}</p>
      </div>

      <article style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 14, background: "#fff" }}>
        <p style={{ margin: "0 0 8px", fontWeight: 600 }}>Shifts</p>
        {shifts.length === 0 ? (
          <p style={{ margin: 0, color: "#6b7280" }}>No shift definitions returned.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {shifts.map((shift, index) => (
              <li key={`${shift.key || "shift"}-${index}`}>
                {(shift.title || shift.key || "Shift")} {shift.start || "--:--"}–{shift.end || "--:--"}
              </li>
            ))}
          </ul>
        )}
      </article>

      {state.status === "loading" ? <p style={{ margin: 0, color: "#6b7280" }}>Loading…</p> : null}

      {state.status === "ready" && state.error ? (
        <p role="alert" style={{ margin: 0, padding: "10px 12px", background: "#fef2f2", color: "#991b1b", borderRadius: 6 }}>
          {state.error} Use Refresh to retry.
        </p>
      ) : null}

      {state.status === "ready" && !state.error ? (
        groupedRows.length === 0 ? (
          <article style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 14, background: "#fff" }}>
            <p style={{ margin: 0, color: "#6b7280" }}>No activity for selected window.</p>
          </article>
        ) : (
          <article style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 14, background: "#fff" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                <thead>
                  <tr>
                    <th align="left" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>Date</th>
                    {shifts.map((shift, index) => (
                      <th key={`${shift.key || "shift"}-${index}`} align="left" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>
                        {shift.title || shift.key || "Shift"}
                      </th>
                    ))}
                    <th align="left" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedRows.map((row) => {
                    const perShiftMetrics = shifts.map((shift) => normalizeMetrics(row.shifts[shift.key || ""]));
                    const total = sumMetrics(perShiftMetrics);

                    return (
                      <tr key={row.date}>
                        <td style={{ padding: "8px 0", borderBottom: "1px solid #f3f4f6", verticalAlign: "top" }}>{row.date}</td>
                        {shifts.map((shift, index) => (
                          <td key={`${row.date}-${shift.key || "shift"}-${index}`} style={{ borderBottom: "1px solid #f3f4f6", verticalAlign: "top", padding: "8px 0" }}>
                            <MetricBlock metrics={normalizeMetrics(row.shifts[shift.key || ""])} />
                          </td>
                        ))}
                        <td style={{ borderBottom: "1px solid #f3f4f6", verticalAlign: "top", padding: "8px 0" }}>
                          <MetricBlock metrics={total} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </article>
        )
      ) : null}
    </section>
  );
}

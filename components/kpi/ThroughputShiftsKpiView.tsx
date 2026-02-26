"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Row = {
  date?: string;
  shift_key?: string;
  metrics?: {
    inventory_moves_qty?: number;
    inventory_moves_count?: number;
    picking_confirmed_lines?: number;
    batches_created?: number;
    incidents_opened?: number;
    incidents_closed?: number;
  };
};

type Shift = { key?: string; title?: string; start?: string; end?: string };

type Payload = { ok: true; generated_at?: string; shifts?: Shift[]; series?: Row[] };

type LoadState = { status: "loading" } | { status: "ready"; data: Payload | null; error: string | null };

const QUERY = "days=14&tz=Europe%2FMoscow";

const formatNumber = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : "0");
const formatDateTime = (value: unknown) => {
  if (typeof value !== "string") return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(parsed);
};

export default function ThroughputShiftsKpiView() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const loadData = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const response = await fetch(`/api/kpi/throughput-shifts?${QUERY}`, { cache: "no-store", credentials: "include" });
      const payload = (await response.json().catch(() => null)) as Payload | null;
      if (!response.ok) {
        setState({ status: "ready", data: null, error: "Could not load throughput-by-shift data. Please try again." });
        return;
      }
      setState({ status: "ready", data: payload, error: null });
    } catch {
      setState({ status: "ready", data: null, error: "Could not load throughput-by-shift data. Please try again." });
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const data = state.status === "ready" ? state.data : null;
  const shiftTitles = useMemo(() => {
    const map = new Map<string, string>();
    for (const shift of data?.shifts || []) {
      const key = String(shift.key || "");
      if (!key) continue;
      map.set(key, `${shift.title || key} (${shift.start || "--:--"}–${shift.end || "--:--"})`);
    }
    return map;
  }, [data?.shifts]);

  const rows = Array.isArray(data?.series)
    ? [...data.series].sort((a, b) => `${b.date || ""}-${b.shift_key || ""}`.localeCompare(`${a.date || ""}-${a.shift_key || ""}`))
    : [];

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Throughput by Shifts</h1>
          <p style={{ margin: "6px 0 0", color: "#4b5563" }}>Moscow-time operational throughput grouped by shifts.</p>
        </div>
        <button type="button" onClick={loadData} disabled={state.status === "loading"}>{state.status === "loading" ? "Loading..." : "Refresh"}</button>
      </div>
      <p style={{ margin: 0, color: "#6b7280" }}>Last updated: {formatDateTime(data?.generated_at)}</p>
      {state.status === "loading" ? <p style={{ margin: 0, color: "#6b7280" }}>Loading…</p> : null}
      {state.status === "ready" && state.error ? <p role="alert" style={{ margin: 0, padding: "10px 12px", background: "#fef2f2", color: "#991b1b", borderRadius: 6 }}>{state.error}</p> : null}

      {state.status === "ready" && !state.error ? (
        rows.length === 0 ? <article style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 14, background: "#fff" }}><p style={{ margin: 0, color: "#6b7280" }}>No throughput shift data available for the selected period.</p></article> : (
          <article style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 14, background: "#fff", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th align="left" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>Date</th>
                  <th align="left" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>Shift</th>
                  <th align="right" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>Inventory Moves Qty</th>
                  <th align="right" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>Inventory Moves Count</th>
                  <th align="right" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>Picking Confirmed</th>
                  <th align="right" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>Batches Created</th>
                  <th align="right" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>Incidents Opened</th>
                  <th align="right" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>Incidents Closed</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={`${row.date || "unknown"}-${row.shift_key || "shift"}-${index}`}>
                    <td style={{ padding: "8px 0" }}>{row.date || "—"}</td>
                    <td>{shiftTitles.get(String(row.shift_key || "")) || row.shift_key || "—"}</td>
                    <td align="right">{formatNumber(row.metrics?.inventory_moves_qty)}</td>
                    <td align="right">{formatNumber(row.metrics?.inventory_moves_count)}</td>
                    <td align="right">{formatNumber(row.metrics?.picking_confirmed_lines)}</td>
                    <td align="right">{formatNumber(row.metrics?.batches_created)}</td>
                    <td align="right">{formatNumber(row.metrics?.incidents_opened)}</td>
                    <td align="right">{formatNumber(row.metrics?.incidents_closed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
        )
      ) : null}
    </section>
  );
}

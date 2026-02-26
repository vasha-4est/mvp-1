"use client";

import { useCallback, useEffect, useState } from "react";

type Row = {
  date?: string;
  metrics?: {
    shipments_open?: number;
    shipments_dispatched?: number;
    avg_ready_to_dispatch_minutes?: number | null;
    p90_ready_to_dispatch_minutes?: number | null;
    overdue_shipments?: number;
  };
};

type Payload = { ok: true; generated_at?: string; series?: Row[] };
type LoadState = { status: "loading" } | { status: "ready"; data: Payload | null; error: string | null };

const QUERY = "days=14&tz=Europe%2FMoscow";
const formatDateTime = (value: unknown) => {
  if (typeof value !== "string") return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(parsed);
};
const formatNumber = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : "0");
const formatMaybeNumber = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value.toFixed(1) : "—");

export default function ShipmentsSlaKpiView() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const loadData = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const response = await fetch(`/api/kpi/shipments-sla?${QUERY}`, { cache: "no-store", credentials: "include" });
      const payload = (await response.json().catch(() => null)) as Payload | null;
      if (!response.ok) {
        setState({ status: "ready", data: null, error: "Could not load shipment SLA data. Please try again." });
        return;
      }
      setState({ status: "ready", data: payload, error: null });
    } catch {
      setState({ status: "ready", data: null, error: "Could not load shipment SLA data. Please try again." });
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const data = state.status === "ready" ? state.data : null;
  const rows = Array.isArray(data?.series) ? [...data.series].sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))) : [];

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Shipment SLA</h1>
          <p style={{ margin: "6px 0 0", color: "#4b5563" }}>Dispatch and readiness delay KPIs in Moscow time.</p>
        </div>
        <button type="button" onClick={loadData} disabled={state.status === "loading"}>{state.status === "loading" ? "Loading..." : "Refresh"}</button>
      </div>
      <p style={{ margin: 0, color: "#6b7280" }}>Last updated: {formatDateTime(data?.generated_at)}</p>

      {state.status === "loading" ? <p style={{ margin: 0, color: "#6b7280" }}>Loading…</p> : null}
      {state.status === "ready" && state.error ? <p role="alert" style={{ margin: 0, padding: "10px 12px", background: "#fef2f2", color: "#991b1b", borderRadius: 6 }}>{state.error}</p> : null}

      {state.status === "ready" && !state.error ? (
        rows.length === 0 ? <article style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 14, background: "#fff" }}><p style={{ margin: 0, color: "#6b7280" }}>No shipments found for the selected period.</p></article> : (
          <article style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 14, background: "#fff", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th align="left" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>Date</th>
                  <th align="right" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>Shipments Open</th>
                  <th align="right" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>Shipments Dispatched</th>
                  <th align="right" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>Avg Ready→Dispatch (min)</th>
                  <th align="right" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>P90 Ready→Dispatch (min)</th>
                  <th align="right" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>Overdue Shipments</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={`${row.date || "unknown"}-${index}`}>
                    <td style={{ padding: "8px 0" }}>{row.date || "—"}</td>
                    <td align="right">{formatNumber(row.metrics?.shipments_open)}</td>
                    <td align="right">{formatNumber(row.metrics?.shipments_dispatched)}</td>
                    <td align="right">{formatMaybeNumber(row.metrics?.avg_ready_to_dispatch_minutes)}</td>
                    <td align="right">{formatMaybeNumber(row.metrics?.p90_ready_to_dispatch_minutes)}</td>
                    <td align="right">{formatNumber(row.metrics?.overdue_shipments)}</td>
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

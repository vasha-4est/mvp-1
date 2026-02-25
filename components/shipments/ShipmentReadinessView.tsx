"use client";

import { useCallback, useEffect, useState } from "react";

type ShipmentReadinessRow = {
  shipment_id?: unknown;
  status?: unknown;
  planned_date?: unknown;
  readiness_pct?: unknown;
  readiness_percent?: unknown;
  missing_items_count?: unknown;
  total_missing_qty?: unknown;
  risk_level?: unknown;
  risk_reason?: unknown;
};

type ShipmentReadinessPayload = {
  ok?: boolean;
  generated_at?: unknown;
  shipments?: unknown;
};

type LoadState =
  | { status: "loading" }
  | { status: "ready"; data: ShipmentReadinessPayload | null; error: string | null };

function asString(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || "—";
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return "—";
}

function formatDateTime(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    return "—";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function asRows(data: ShipmentReadinessPayload | null): ShipmentReadinessRow[] {
  return Array.isArray(data?.shipments) ? (data?.shipments as ShipmentReadinessRow[]) : [];
}

export default function ShipmentReadinessView() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const loadData = useCallback(async () => {
    setState({ status: "loading" });

    try {
      const response = await fetch("/api/shipments/readiness", {
        method: "GET",
        cache: "no-store",
        credentials: "include",
      });

      const payload = (await response.json().catch(() => null)) as ShipmentReadinessPayload | null;

      if (!response.ok) {
        setState({
          status: "ready",
          data: null,
          error: "Could not load shipment readiness data. Please try again.",
        });
        return;
      }

      setState({
        status: "ready",
        data: payload,
        error: null,
      });
    } catch {
      setState({
        status: "ready",
        data: null,
        error: "Could not load shipment readiness data. Please try again.",
      });
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const data = state.status === "ready" ? state.data : null;
  const rows = asRows(data);

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Shipment Readiness</h1>
          <p style={{ margin: "6px 0 0", color: "#4b5563" }}>Read-only readiness view (Phase A)</p>
        </div>
        <button type="button" onClick={loadData} disabled={state.status === "loading"}>
          {state.status === "loading" ? "Loading..." : "Refresh"}
        </button>
      </div>

      <p style={{ margin: 0, color: "#6b7280" }}>Last updated: {formatDateTime(data?.generated_at)}</p>

      {state.status === "loading" ? <p style={{ margin: 0, color: "#6b7280" }}>Loading…</p> : null}

      {state.status === "ready" && state.error ? (
        <p role="alert" style={{ margin: 0, padding: "10px 12px", background: "#fef2f2", color: "#991b1b", borderRadius: 6 }}>
          {state.error}
        </p>
      ) : null}

      {state.status === "ready" && !state.error ? (
        <article style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 14, background: "#fff" }}>
          {rows.length === 0 ? (
            <p style={{ margin: 0, color: "#6b7280" }}>No shipments to show.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th align="left" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>shipment_id</th>
                    <th align="left" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>status</th>
                    <th align="left" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>planned_date</th>
                    <th align="right" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>readiness_pct</th>
                    <th align="right" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>missing_items_count</th>
                    <th align="left" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>risk_level</th>
                    <th align="left" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>risk_reason</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item, index) => (
                    <tr key={`${asString(item.shipment_id)}-${index}`}>
                      <td style={{ padding: "8px 0" }}>{asString(item.shipment_id)}</td>
                      <td style={{ padding: "8px 0" }}>{asString(item.status)}</td>
                      <td style={{ padding: "8px 0" }}>{asString(item.planned_date)}</td>
                      <td align="right" style={{ padding: "8px 0" }}>{asString(item.readiness_pct ?? item.readiness_percent)}</td>
                      <td align="right" style={{ padding: "8px 0" }}>{asString(item.missing_items_count ?? item.total_missing_qty)}</td>
                      <td style={{ padding: "8px 0" }}>{asString(item.risk_level)}</td>
                      <td style={{ padding: "8px 0" }}>{asString(item.risk_reason)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
      ) : null}
    </section>
  );
}

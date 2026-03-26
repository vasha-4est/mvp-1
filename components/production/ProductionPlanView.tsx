"use client";

import { useCallback, useEffect, useState } from "react";

type ProductionPlanItem = {
  sku_id?: unknown;
  demand_qty?: unknown;
  available_qty?: unknown;
  covered_qty?: unknown;
  production_qty?: unknown;
  shipment_count?: unknown;
  earliest_deadline_at?: unknown;
  coverage_status?: unknown;
  priority_reason?: unknown;
};

type ProductionPlanPayload = {
  ok?: boolean;
  generated_at?: unknown;
  import_batch_id?: unknown;
  summary?: {
    shipment_count?: unknown;
    sku_count?: unknown;
    demand_qty?: unknown;
    available_qty?: unknown;
    covered_qty?: unknown;
    production_qty?: unknown;
    uncovered_qty?: unknown;
    urgent_skus?: unknown;
  };
  items?: unknown;
};

type LoadState =
  | { status: "loading" }
  | { status: "ready"; data: ProductionPlanPayload | null; error: string | null };

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

function asNumber(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : "—";
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

function asRows(data: ProductionPlanPayload | null): ProductionPlanItem[] {
  return Array.isArray(data?.items) ? (data?.items as ProductionPlanItem[]) : [];
}

export default function ProductionPlanView() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const loadData = useCallback(async () => {
    setState({ status: "loading" });

    try {
      const response = await fetch("/api/production/plan", {
        method: "GET",
        cache: "no-store",
        credentials: "include",
      });

      const payload = (await response.json().catch(() => null)) as ProductionPlanPayload | null;

      if (!response.ok) {
        setState({
          status: "ready",
          data: null,
          error: "Could not load production plan data. Please try again.",
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
        error: "Could not load production plan data. Please try again.",
      });
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const data = state.status === "ready" ? state.data : null;
  const rows = asRows(data);
  const summary = data?.summary ?? {};
  const hasImportBatch = typeof data?.import_batch_id === "string" && data.import_batch_id.trim().length > 0;

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Production Plan</h1>
          <p style={{ margin: "6px 0 0", color: "#4b5563" }}>Read-only demand to production coverage view (PR-118)</p>
        </div>
        <button type="button" onClick={loadData} disabled={state.status === "loading"}>
          {state.status === "loading" ? "Loading..." : "Refresh"}
        </button>
      </div>

      <p style={{ margin: 0, color: "#6b7280" }}>Last updated: {formatDateTime(data?.generated_at)}</p>
      <p style={{ margin: 0, color: "#6b7280" }}>Import batch: {asString(data?.import_batch_id)}</p>

      {state.status === "loading" ? <p style={{ margin: 0, color: "#6b7280" }}>Loading…</p> : null}

      {state.status === "ready" && state.error ? (
        <p role="alert" style={{ margin: 0, padding: "10px 12px", background: "#fef2f2", color: "#991b1b", borderRadius: 6 }}>
          {state.error}
        </p>
      ) : null}

      {state.status === "ready" && !state.error ? (
        <div style={{ display: "grid", gap: 16 }}>
          <article style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 14, background: "#fff" }}>
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
              <Metric label="Shipments" value={summary.shipment_count} />
              <Metric label="SKUs" value={summary.sku_count} />
              <Metric label="Demand" value={summary.demand_qty} />
              <Metric label="Available" value={summary.available_qty} />
              <Metric label="Covered" value={summary.covered_qty} />
              <Metric label="Production" value={summary.production_qty} />
            </div>
            <div style={{ display: "grid", gap: 12, marginTop: 12, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
              <Metric label="Uncovered" value={summary.uncovered_qty} />
              <Metric label="Urgent SKUs" value={summary.urgent_skus} />
            </div>
          </article>

          <article style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 14, background: "#fff" }}>
            {rows.length === 0 ? (
              <p style={{ margin: 0, color: "#6b7280" }}>
                {hasImportBatch
                  ? "Current staged shipment plan is fully covered by inventory. No production action is required right now."
                  : "No staged shipment plan is available yet."}
              </p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th align="left" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>sku_id</th>
                      <th align="right" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>demand_qty</th>
                      <th align="right" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>available_qty</th>
                      <th align="right" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>production_qty</th>
                      <th align="right" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>shipments</th>
                      <th align="left" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>earliest_deadline_at</th>
                      <th align="left" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>coverage_status</th>
                      <th align="left" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>priority_reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((item, index) => (
                      <tr key={`${asString(item.sku_id)}-${index}`}>
                        <td style={{ padding: "8px 0" }}>{asString(item.sku_id)}</td>
                        <td align="right" style={{ padding: "8px 0" }}>{asNumber(item.demand_qty)}</td>
                        <td align="right" style={{ padding: "8px 0" }}>{asNumber(item.available_qty)}</td>
                        <td align="right" style={{ padding: "8px 0" }}>{asNumber(item.production_qty)}</td>
                        <td align="right" style={{ padding: "8px 0" }}>{asNumber(item.shipment_count)}</td>
                        <td style={{ padding: "8px 0" }}>{formatDateTime(item.earliest_deadline_at)}</td>
                        <td style={{ padding: "8px 0" }}>{asString(item.coverage_status)}</td>
                        <td style={{ padding: "8px 0" }}>{asString(item.priority_reason)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>
        </div>
      ) : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: unknown }) {
  return (
    <article style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, background: "#fcfcfd" }}>
      <p style={{ margin: 0, color: "#6b7280", fontSize: 13 }}>{label}</p>
      <p style={{ margin: "6px 0 0", fontSize: 24, fontWeight: 700 }}>{asNumber(value)}</p>
    </article>
  );
}

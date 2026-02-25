"use client";

import { useCallback, useEffect, useState } from "react";

type DeficitSkuRow = {
  sku_id: string;
  missing_qty: number;
};

type DeficitPayload = {
  ok: true;
  generated_at?: string;
  deficit?: {
    total_missing_qty?: number;
    top_short_skus?: DeficitSkuRow[];
    picking?: {
      total_short_qty?: number;
    };
  };
  incidents?: {
    open_total?: number;
    by_zone?: Record<string, number>;
  };
};

type DeficitErrorPayload = {
  ok?: false;
  error?: string;
  code?: string;
};

function asErrorPayload(value: unknown): DeficitErrorPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as DeficitErrorPayload;
}

type LoadState =
  | { status: "loading" }
  | { status: "ready"; data: DeficitPayload | null; error: string | null; disabledMessage: string | null };

const QUERY = "limit_shipments=10&limit_picking=50";

function formatNumber(value: unknown): string {
  return typeof value === "number" ? value.toLocaleString() : "0";
}

function formatDateTime(value: unknown): string {
  if (typeof value !== "string") {
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

function getFriendlyErrorMessage(status: number): string {
  if (status >= 500) {
    return "Could not load deficit data. Please try again.";
  }

  return "Could not load deficit data. Please try again.";
}

function SummaryCard({ label, value }: { label: string; value: unknown }) {
  return (
    <article style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 14, background: "#fff" }}>
      <p style={{ margin: 0, color: "#4b5563", fontSize: 13 }}>{label}</p>
      <p style={{ margin: "6px 0 0", fontSize: 32, fontWeight: 700 }}>{formatNumber(value)}</p>
    </article>
  );
}

export default function DeficitKpiView() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const loadData = useCallback(async () => {
    setState({ status: "loading" });

    try {
      const response = await fetch(`/api/kpi/deficit?${QUERY}`, {
        method: "GET",
        cache: "no-store",
        credentials: "include",
      });

      const payload = (await response.json().catch(() => null)) as unknown;
      const errorPayload = asErrorPayload(payload);

      if (!response.ok) {
        const isFlagDisabled =
          response.status === 400 &&
          typeof errorPayload?.error === "string" &&
          errorPayload.error.toUpperCase().includes("FLAG_DISABLED");

        if (isFlagDisabled) {
          setState({
            status: "ready",
            data: null,
            error: null,
            disabledMessage: "Feature disabled. Ask admin to enable KPI flags.",
          });
          return;
        }

        setState({
          status: "ready",
          data: null,
          error: getFriendlyErrorMessage(response.status),
          disabledMessage: null,
        });
        return;
      }

      setState({ status: "ready", data: (payload as DeficitPayload) ?? null, error: null, disabledMessage: null });
    } catch {
      setState({
        status: "ready",
        data: null,
        error: "Could not load deficit data. Please try again.",
        disabledMessage: null,
      });
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const data = state.status === "ready" ? state.data : null;
  const topSkus = Array.isArray(data?.deficit?.top_short_skus) ? data.deficit.top_short_skus.slice(0, 10) : [];
  const incidentsByZone = Object.entries(data?.incidents?.by_zone ?? {});

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Deficit KPI</h1>
          <p style={{ margin: "6px 0 0", color: "#4b5563" }}>Read-only KPI view for shortage and incident signal.</p>
        </div>
        <button type="button" onClick={loadData} disabled={state.status === "loading"}>
          {state.status === "loading" ? "Loading..." : "Refresh"}
        </button>
      </div>

      <p style={{ margin: 0, color: "#6b7280" }}>Last updated: {formatDateTime(data?.generated_at)}</p>

      {state.status === "loading" ? <p style={{ margin: 0, color: "#6b7280" }}>Loading…</p> : null}

      {state.status === "ready" && state.disabledMessage ? (
        <p role="status" style={{ margin: 0, padding: "10px 12px", background: "#fffbeb", color: "#92400e", borderRadius: 6 }}>
          {state.disabledMessage}
        </p>
      ) : null}

      {state.status === "ready" && state.error ? (
        <p role="alert" style={{ margin: 0, padding: "10px 12px", background: "#fef2f2", color: "#991b1b", borderRadius: 6 }}>
          {state.error}
        </p>
      ) : null}

      {state.status === "ready" && !state.error && !state.disabledMessage ? (
        <>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            <SummaryCard label="Total missing qty" value={data?.deficit?.total_missing_qty} />
            <SummaryCard label="Picking short qty" value={data?.deficit?.picking?.total_short_qty} />
            <SummaryCard label="Open incidents" value={data?.incidents?.open_total} />
          </div>

          <article style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 14, background: "#fff" }}>
            <h2 style={{ marginTop: 0, marginBottom: 10 }}>Top shortage SKUs</h2>
            {topSkus.length === 0 ? (
              <p style={{ margin: 0, color: "#6b7280" }}>No shortage SKUs found.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th align="left" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>
                        SKU
                      </th>
                      <th align="right" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>
                        Missing Qty
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {topSkus.map((item, index) => (
                      <tr key={`${item.sku_id}-${index}`}>
                        <td style={{ padding: "8px 0" }}>{item.sku_id || "—"}</td>
                        <td align="right">{formatNumber(item.missing_qty)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>

          <article style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 14, background: "#fff" }}>
            <h2 style={{ marginTop: 0, marginBottom: 10 }}>By-zone incidents</h2>
            {incidentsByZone.length === 0 ? (
              <p style={{ margin: 0, color: "#6b7280" }}>No open incidents by zone.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th align="left" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>
                        Zone
                      </th>
                      <th align="right" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>
                        Count
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {incidentsByZone.map(([zone, count]) => (
                      <tr key={zone}>
                        <td style={{ padding: "8px 0" }}>{zone}</td>
                        <td align="right">{formatNumber(count)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>
        </>
      ) : null}
    </section>
  );
}

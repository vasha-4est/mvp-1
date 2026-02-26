"use client";

import { useCallback, useEffect, useState } from "react";

import type { DailySummaryPayload } from "@/lib/daily/readDailySummary";

type ErrorPayload = {
  ok?: false;
  error?: string;
};

type LoadState =
  | { status: "loading" }
  | { status: "ready"; data: DailySummaryPayload | null; error: string | null };

function asErrorPayload(value: unknown): ErrorPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as ErrorPayload;
}

function formatNumber(value: unknown): string {
  return typeof value === "number" ? value.toLocaleString() : "0";
}

function formatDateTime(value: unknown): string {
  if (typeof value !== "string") return "—";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function DayCard({
  title,
  day,
}: {
  title: string;
  day: DailySummaryPayload["days"][number] | null;
}) {
  if (!day) {
    return (
      <article style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 14, background: "#fff" }}>
        <h2 style={{ marginTop: 0 }}>{title}</h2>
        <p style={{ margin: 0, color: "#6b7280" }}>No data for this day.</p>
      </article>
    );
  }

  return (
    <article style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 14, background: "#fff" }}>
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      <p style={{ margin: "4px 0 10px", color: "#6b7280" }}>{day.date}</p>
      <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
        <li>Inventory moves qty: {formatNumber(day.metrics.inventory_moves_qty)}</li>
        <li>Inventory moves count: {formatNumber(day.metrics.inventory_moves_count)}</li>
        <li>Incidents opened: {formatNumber(day.metrics.incidents_opened)}</li>
        <li>Incidents closed: {formatNumber(day.metrics.incidents_closed)}</li>
        <li>Incidents open now: {formatNumber(day.metrics.incidents_open_now)}</li>
        <li>Picking confirmed events: {formatNumber(day.metrics.picking_confirmed_events)}</li>
        <li>Batches created events: {formatNumber(day.metrics.batches_created_events)}</li>
      </ul>

      <h3 style={{ marginBottom: 8 }}>Top incident zones</h3>
      {day.highlights.top_incident_zones.length === 0 ? (
        <p style={{ margin: 0, color: "#6b7280" }}>No incident highlights.</p>
      ) : (
        <ul style={{ marginTop: 0, paddingLeft: 18 }}>
          {day.highlights.top_incident_zones.map((row) => (
            <li key={row.zone}>
              {row.zone}: {formatNumber(row.count)}
            </li>
          ))}
        </ul>
      )}

      <h3 style={{ marginBottom: 8 }}>Top moved SKUs</h3>
      {day.highlights.top_moved_skus.length === 0 ? (
        <p style={{ margin: 0, color: "#6b7280" }}>No SKU movement highlights.</p>
      ) : (
        <ul style={{ marginTop: 0, paddingLeft: 18 }}>
          {day.highlights.top_moved_skus.map((row) => (
            <li key={row.sku_id}>
              {row.sku_id}: {formatNumber(row.qty)}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

export default function DailySummaryView() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const loadData = useCallback(async () => {
    setState({ status: "loading" });

    try {
      const response = await fetch("/api/daily/summary?days=2", {
        method: "GET",
        cache: "no-store",
        credentials: "include",
      });

      const payload = (await response.json().catch(() => null)) as unknown;
      const errorPayload = asErrorPayload(payload);

      if (!response.ok) {
        setState({
          status: "ready",
          data: null,
          error: errorPayload?.error ?? "Could not load daily summary.",
        });
        return;
      }

      setState({ status: "ready", data: (payload as DailySummaryPayload) ?? null, error: null });
    } catch {
      setState({
        status: "ready",
        data: null,
        error: "Could not load daily summary.",
      });
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const data = state.status === "ready" ? state.data : null;
  const today = data?.days[data.days.length - 1] ?? null;
  const yesterday = data?.days.length && data.days.length > 1 ? data.days[data.days.length - 2] : null;
  const hasAnyData = Boolean(data && (data.days.length > 0 || data.now.open_incidents > 0 || data.now.shipments_open > 0));

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>Daily Summary</h1>
          <p style={{ margin: "6px 0 0", color: "#4b5563" }}>Today vs yesterday snapshot with current operational risks.</p>
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

      {state.status === "ready" && !state.error && !hasAnyData ? (
        <article style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 14, background: "#fff" }}>
          <h2 style={{ marginTop: 0 }}>No data available</h2>
          <p style={{ margin: 0, color: "#6b7280" }}>No records found for the selected period yet.</p>
        </article>
      ) : null}

      {state.status === "ready" && !state.error && hasAnyData ? (
        <>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
            <DayCard title="Today" day={today} />
            <DayCard title="Yesterday" day={yesterday} />
          </div>

          <article style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 14, background: "#fff" }}>
            <h2 style={{ marginTop: 0, marginBottom: 10 }}>Now — Risks</h2>
            <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
              <li>Open incidents: {formatNumber(data?.now.open_incidents)}</li>
              <li>Shipments open: {formatNumber(data?.now.shipments_open)}</li>
              <li>Picking open lists: {formatNumber(data?.now.picking_open_lists)}</li>
            </ul>
            <p style={{ marginBottom: 8, marginTop: 12 }}>Open incidents by severity:</p>
            <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
              <li>Low: {formatNumber(data?.now.open_incidents_by_severity.low)}</li>
              <li>Medium: {formatNumber(data?.now.open_incidents_by_severity.medium)}</li>
              <li>High: {formatNumber(data?.now.open_incidents_by_severity.high)}</li>
              <li>Critical: {formatNumber(data?.now.open_incidents_by_severity.critical)}</li>
            </ul>
          </article>
        </>
      ) : null}
    </section>
  );
}

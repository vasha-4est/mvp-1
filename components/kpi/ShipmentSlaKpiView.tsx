"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type ShipmentSlaRow = {
  date?: string;
  metrics?: {
    shipments_created?: number;
    shipments_ready?: number;
    shipments_ready_on_time?: number;
    shipments_ready_late?: number;
    shipments_open_now?: number;
    avg_ready_hours?: number;
    p95_ready_hours?: number;
  };
};

type ShipmentSlaPayload = {
  ok?: boolean;
  generated_at?: string;
  tz?: string;
  window?: { from_date?: string; to_date?: string; days?: number };
  sla_hours?: number;
  series?: ShipmentSlaRow[];
  error?: string;
};

type FlagsPayload = {
  ok?: boolean;
  flags?: {
    SYSTEM_READONLY?: boolean;
  };
};

type LoadState =
  | { status: "loading" }
  | { status: "ready"; data: ShipmentSlaPayload | null; error: string | null; isReadonly: boolean };

const DEFAULT_DAYS = 14;
const DEFAULT_TZ = "Europe/Moscow";
const DEFAULT_SLA_HOURS = 24;

function parseIntParam(raw: string | null, fallback: number): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return parsed;
}

function formatDateTimeByTz(value: unknown, tz: string): string {
  if (typeof value !== "string") return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return `${value} (${tz})`;

  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: tz,
    }).format(parsed);
  } catch {
    return `${value} (${tz})`;
  }
}

function formatNumber(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : "0";
}

function formatHours(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(1) : "—";
}

function formatOnTimeRate(onTime: unknown, ready: unknown): string {
  if (typeof onTime !== "number" || !Number.isFinite(onTime)) return "—";
  if (typeof ready !== "number" || !Number.isFinite(ready) || ready <= 0) return "—";
  return `${((onTime / ready) * 100).toFixed(1)}%`;
}

export default function ShipmentSlaKpiView() {
  const searchParams = useSearchParams();
  const days = parseIntParam(searchParams.get("days"), DEFAULT_DAYS);
  const tz = (searchParams.get("tz") || "").trim() || DEFAULT_TZ;
  const slaHours = parseIntParam(searchParams.get("sla_hours"), DEFAULT_SLA_HOURS);

  const query = useMemo(
    () => `days=${encodeURIComponent(String(days))}&tz=${encodeURIComponent(tz)}&sla_hours=${encodeURIComponent(String(slaHours))}`,
    [days, tz, slaHours]
  );

  const [state, setState] = useState<LoadState>({ status: "loading" });

  const loadData = useCallback(async () => {
    setState({ status: "loading" });

    try {
      const [dataResponse, flagsResponse] = await Promise.all([
        fetch(`/api/kpi/shipment-sla?${query}`, {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        }),
        fetch("/api/flags", {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        }),
      ]);

      const dataPayload = (await dataResponse.json().catch(() => null)) as ShipmentSlaPayload | null;
      const flagsPayload = (await flagsResponse.json().catch(() => null)) as FlagsPayload | null;
      const isReadonly = flagsPayload?.flags?.SYSTEM_READONLY === true;

      if (!dataResponse.ok || dataPayload?.ok === false) {
        setState({
          status: "ready",
          data: dataPayload,
          error: "Could not load shipment SLA data. Please try again.",
          isReadonly,
        });
        return;
      }

      setState({ status: "ready", data: dataPayload, error: null, isReadonly });
    } catch {
      setState({
        status: "ready",
        data: null,
        error: "Could not load shipment SLA data. Please try again.",
        isReadonly: false,
      });
    }
  }, [query]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const data = state.status === "ready" ? state.data : null;
  const rows = Array.isArray(data?.series) ? [...data.series].sort((a, b) => String(a.date || "").localeCompare(String(b.date || ""))) : [];
  const showEmptyState = state.status === "ready" && (state.error !== null || rows.length === 0);

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Shipment SLA</h1>
          <p style={{ margin: "6px 0 0", color: "#4b5563" }}>Moscow-time operational SLA readiness</p>
        </div>
        <button type="button" onClick={loadData} disabled={state.status === "loading"}>
          {state.status === "loading" ? "Loading..." : "Refresh"}
        </button>
      </div>

      {state.status === "ready" && state.isReadonly ? (
        <p role="status" style={{ margin: 0, padding: "10px 12px", background: "#fffbeb", color: "#92400e", borderRadius: 6 }}>
          System is read-only
        </p>
      ) : null}

      <div style={{ display: "grid", gap: 6, color: "#4b5563" }}>
        <p style={{ margin: 0 }}>Last updated: {formatDateTimeByTz(data?.generated_at, tz)}</p>
        <p style={{ margin: 0 }}>
          Window: {data?.window?.from_date || "—"} → {data?.window?.to_date || "—"} (days={data?.window?.days || days}) • SLA: {data?.sla_hours || slaHours}h • TZ: {data?.tz || tz}
        </p>
      </div>

      {state.status === "loading" ? <p style={{ margin: 0, color: "#6b7280" }}>Loading…</p> : null}

      {showEmptyState ? (
        <article style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 14, background: "#fff" }}>
          <h2 style={{ margin: "0 0 8px" }}>No shipment SLA data</h2>
          <p style={{ margin: 0, color: "#6b7280" }}>No shipments were created in this window, or readiness events are missing.</p>
        </article>
      ) : null}

      {state.status === "ready" && !showEmptyState ? (
        <article style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 14, background: "#fff" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 920 }}>
              <thead>
                <tr>
                  <th align="left" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>Date</th>
                  <th align="right" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>Created</th>
                  <th align="right" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>Ready</th>
                  <th align="right" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>On time</th>
                  <th align="right" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>On time %</th>
                  <th align="right" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>Late</th>
                  <th align="right" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>Open now</th>
                  <th align="right" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>Avg ready (h)</th>
                  <th align="right" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>P95 ready (h)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={`${row.date || "unknown"}-${index}`}>
                    <td style={{ padding: "8px 0", borderBottom: "1px solid #f3f4f6" }}>{row.date || "—"}</td>
                    <td align="right" style={{ borderBottom: "1px solid #f3f4f6" }}>{formatNumber(row.metrics?.shipments_created)}</td>
                    <td align="right" style={{ borderBottom: "1px solid #f3f4f6" }}>{formatNumber(row.metrics?.shipments_ready)}</td>
                    <td align="right" style={{ borderBottom: "1px solid #f3f4f6" }}>{formatNumber(row.metrics?.shipments_ready_on_time)}</td>
                    <td align="right" style={{ borderBottom: "1px solid #f3f4f6" }}>
                      {formatOnTimeRate(row.metrics?.shipments_ready_on_time, row.metrics?.shipments_ready)}
                    </td>
                    <td align="right" style={{ borderBottom: "1px solid #f3f4f6" }}>{formatNumber(row.metrics?.shipments_ready_late)}</td>
                    <td align="right" style={{ borderBottom: "1px solid #f3f4f6" }}>{formatNumber(row.metrics?.shipments_open_now)}</td>
                    <td align="right" style={{ borderBottom: "1px solid #f3f4f6" }}>{formatHours(row.metrics?.avg_ready_hours)}</td>
                    <td align="right" style={{ borderBottom: "1px solid #f3f4f6" }}>{formatHours(row.metrics?.p95_ready_hours)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}
    </section>
  );
}

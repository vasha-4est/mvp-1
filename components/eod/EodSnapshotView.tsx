"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { EodSnapshotPayload } from "@/lib/eod/snapshot";

type FlagsResponse = { ok?: boolean; flags?: { SYSTEM_READONLY?: boolean } };

type LoadState =
  | { status: "loading" }
  | { status: "ready"; data: EodSnapshotPayload | null; error: string | null };

const TZ = "Europe/Moscow";

function currentDateInTz(tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

function formatDateTime(value: string | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

function formatNumber(value: unknown): string {
  return typeof value === "number" ? value.toLocaleString() : "0";
}

export default function EodSnapshotView() {
  const [date, setDate] = useState(currentDateInTz(TZ));
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [isGenerating, setIsGenerating] = useState(false);
  const [isReadonly, setIsReadonly] = useState(false);

  const loadSnapshot = useCallback(async () => {
    setLoadState({ status: "loading" });
    try {
      const response = await fetch(`/api/eod/snapshot?date=${encodeURIComponent(date)}&tz=${encodeURIComponent(TZ)}`, {
        method: "GET",
        cache: "no-store",
        credentials: "include",
      });

      const payload = (await response.json().catch(() => null)) as { error?: string; code?: string } | null;
      if (response.status === 404) {
        setLoadState({ status: "ready", data: null, error: null });
        return;
      }

      if (!response.ok) {
        setLoadState({
          status: "ready",
          data: null,
          error: payload?.code ? `${payload.code}: ${payload?.error ?? "Could not load EOD snapshot."}` : payload?.error ?? "Could not load EOD snapshot.",
        });
        return;
      }

      setLoadState({ status: "ready", data: payload as EodSnapshotPayload, error: null });
    } catch {
      setLoadState({ status: "ready", data: null, error: "Could not load EOD snapshot." });
    }
  }, [date]);

  const loadFlags = useCallback(async () => {
    try {
      const response = await fetch("/api/flags", { method: "GET", cache: "no-store", credentials: "include" });
      const payload = (await response.json().catch(() => null)) as FlagsResponse | null;
      if (!response.ok || payload?.ok !== true) return;
      setIsReadonly(payload.flags?.SYSTEM_READONLY === true);
    } catch {
      setIsReadonly(false);
    }
  }, []);

  const generateSnapshot = useCallback(async () => {
    setIsGenerating(true);
    try {
      const response = await fetch("/api/eod/snapshot", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date, tz: TZ, days_window: 1 }),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string; code?: string } | null;
      if (!response.ok) {
        setLoadState({
          status: "ready",
          data: null,
          error: payload?.code ? `${payload.code}: ${payload?.error ?? "Could not generate snapshot."}` : payload?.error ?? "Could not generate snapshot.",
        });
        return;
      }

      setLoadState({ status: "ready", data: payload as EodSnapshotPayload, error: null });
    } catch {
      setLoadState({ status: "ready", data: null, error: "Could not generate snapshot." });
    } finally {
      setIsGenerating(false);
    }
  }, [date]);

  useEffect(() => {
    void loadFlags();
  }, [loadFlags]);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  const data = loadState.status === "ready" ? loadState.data : null;
  const riskFlags = useMemo(() => data?.snapshot.tomorrow_load.risk_flags ?? [], [data]);

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>End of day snapshot</h1>
          <p style={{ margin: "6px 0 0", color: "#4b5563" }}>Daily compact snapshot with tomorrow load (timezone: {TZ}).</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <button type="button" onClick={loadSnapshot} disabled={loadState.status === "loading" || isGenerating}>
            {loadState.status === "loading" ? "Loading..." : "Refresh"}
          </button>
          {!isReadonly ? (
            <button type="button" onClick={generateSnapshot} disabled={isGenerating || loadState.status === "loading"}>
              {isGenerating ? "Generating..." : "Generate snapshot"}
            </button>
          ) : null}
        </div>
      </div>

      <p style={{ margin: 0, color: "#6b7280" }}>Last updated: {formatDateTime(data?.generated_at)}</p>

      {loadState.status === "ready" && loadState.error ? (
        <p role="alert" style={{ margin: 0, padding: "10px 12px", background: "#fef2f2", color: "#991b1b", borderRadius: 6 }}>
          {loadState.error}
        </p>
      ) : null}

      {loadState.status === "ready" && !loadState.error && !data ? (
        <article style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 14, background: "#fff" }}>
          <h2 style={{ marginTop: 0 }}>No snapshot for this date.</h2>
          <p style={{ margin: 0, color: "#6b7280" }}>Click ‘Generate snapshot’.</p>
        </article>
      ) : null}

      {data ? (
        <>
          <article style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 14, background: "#fff" }}>
            <h2 style={{ marginTop: 0 }}>Headline</h2>
            <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
              <li>Deficit total missing qty: {formatNumber(data.snapshot.headline.deficit_total_missing_qty)}</li>
              <li>Picking confirmed events: {formatNumber(data.snapshot.headline.picking_confirmed_events)}</li>
              <li>Inventory moves qty: {formatNumber(data.snapshot.headline.inventory_moves_qty)}</li>
              <li>Incidents open now: {formatNumber(data.snapshot.headline.incidents_open_now)}</li>
              <li>Shipments open now: {formatNumber(data.snapshot.headline.shipments_open_now)}</li>
              <li>Locks active total: {formatNumber(data.snapshot.headline.locks_active_total)}</li>
            </ul>
          </article>

          <article style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 14, background: "#fff" }}>
            <h2 style={{ marginTop: 0 }}>Tomorrow load</h2>
            <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
              <li>Picking open lists: {formatNumber(data.snapshot.tomorrow_load.picking_open_lists)}</li>
              <li>Packaging queue: {formatNumber(data.snapshot.tomorrow_load.stations.packaging_queue ?? 0)}</li>
              <li>Labeling queue: {formatNumber(data.snapshot.tomorrow_load.stations.labeling_queue ?? 0)}</li>
              <li>Assembly queue: {formatNumber(data.snapshot.tomorrow_load.stations.assembly_queue ?? 0)}</li>
              <li>QC queue: {formatNumber(data.snapshot.tomorrow_load.stations.qc_queue ?? 0)}</li>
            </ul>
            <p style={{ marginBottom: 8, marginTop: 12 }}>Risk flags:</p>
            {riskFlags.length === 0 ? <p style={{ margin: 0, color: "#6b7280" }}>No active risk flags.</p> : null}
            {riskFlags.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
                {riskFlags.map((flag) => (
                  <li key={flag}>{flag}</li>
                ))}
              </ul>
            ) : null}
          </article>

          <article style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 14, background: "#fff" }}>
            <h2 style={{ marginTop: 0 }}>Notes</h2>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{data.snapshot.notes}</pre>
          </article>
        </>
      ) : null}
    </section>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { ControlTowerErrorState } from "./ControlTowerErrorState";
import { ControlTowerLoadingState } from "./ControlTowerLoadingState";
import { ControlTowerSection } from "./ControlTowerSection";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; payload: unknown; intelligence: unknown; errorMessage?: string };

const MAX_RECENT_EVENTS = 8;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function formatNumber(value: unknown): string {
  return typeof value === "number" ? value.toLocaleString() : "—";
}

function formatDate(value: unknown): string {
  if (typeof value !== "string") {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function formatValue(value: unknown): string {
  if (typeof value === "number") {
    return value.toLocaleString();
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  return "—";
}

function getRootPayload(payload: unknown): Record<string, unknown> {
  const root = asRecord(payload);
  if (!root) {
    return {};
  }

  const nestedData = asRecord(root.data);
  return nestedData ?? root;
}

function getRecentEvents(data: Record<string, unknown>): Array<Record<string, unknown>> {
  const candidates = [data.recent_events, data.events, data.recentEvents];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.map((item) => asRecord(item)).filter((item): item is Record<string, unknown> => !!item);
    }
  }

  return [];
}

function getTopBottlenecks(source: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(source)) {
    return [];
  }

  return source.map((item) => asRecord(item)).filter((item): item is Record<string, unknown> => !!item);
}

function SummaryList({ source }: { source: unknown }) {
  const record = asRecord(source);
  if (!record || Object.keys(record).length === 0) {
    return <p style={{ margin: 0, color: "#666" }}>No data yet.</p>;
  }

  return (
    <ul style={{ margin: 0, paddingLeft: 18 }}>
      {Object.entries(record).map(([key, value]) => (
        <li key={key}>
          <strong>{key}</strong>: {formatValue(value)}
        </li>
      ))}
    </ul>
  );
}

export function ControlTowerView() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });

    try {
      const response = await fetch("/api/control-tower", {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        setState({
          status: "ready",
          payload: {},
          intelligence: {},
          errorMessage: `Request failed with status ${response.status}`,
        });
        return;
      }

      const payload = (await response.json()) as unknown;
      const intelligenceResponse = await fetch("/api/control-tower/intelligence", {
        method: "GET",
        cache: "no-store",
      });

      const intelligence = intelligenceResponse.ok ? ((await intelligenceResponse.json()) as unknown) : {};

      setState({ status: "ready", payload, intelligence });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load Control Tower data.";
      setState({ status: "ready", payload: {}, intelligence: {}, errorMessage: message });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.status === "loading") {
    return <ControlTowerLoadingState />;
  }

  const data = getRootPayload(state.payload);
  const recentEvents = getRecentEvents(data).slice(0, MAX_RECENT_EVENTS);
  const intelligenceRoot = getRootPayload(state.intelligence);
  const assemblyIntelligence = asRecord(intelligenceRoot.assembly) ?? {};
  const availabilityStats = asRecord(assemblyIntelligence.availability_stats) ?? {};
  const topBottlenecks = getTopBottlenecks(assemblyIntelligence.top_bottlenecks).slice(0, 5);
  const deficitSummary = asRecord(data.deficit_summary);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {state.errorMessage ? <ControlTowerErrorState message={state.errorMessage} onRetry={load} /> : null}

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        <ControlTowerSection title="WIP Summary">
          <SummaryList source={data.wip_summary ?? data.wip} />
        </ControlTowerSection>

        <ControlTowerSection title="Drying Risk Summary">
          <SummaryList source={data.drying_risk_summary ?? data.drying_risk} />
        </ControlTowerSection>

        <ControlTowerSection title="Station Load Summary">
          <SummaryList source={data.station_load_summary ?? data.station_load} />
        </ControlTowerSection>

        <ControlTowerSection title="Recent Events">
          {recentEvents.length === 0 ? (
            <p style={{ margin: 0, color: "#666" }}>No data yet.</p>
          ) : (
            <ol style={{ margin: 0, paddingLeft: 18 }}>
              {recentEvents.map((event, index) => (
                <li key={`${String(event.id ?? event.at ?? index)}-${index}`}>
                  <strong>{String(event.type ?? event.name ?? "—")}</strong> — {formatDate(event.at ?? event.time)} —{" "}
                  {String(event.message ?? event.batch_code ?? event.station ?? "—")}
                  {typeof event.count === "number" ? ` (${formatNumber(event.count)})` : ""}
                </li>
              ))}
            </ol>
          )}
        </ControlTowerSection>

        <ControlTowerSection title="Assembly Intelligence">
          <p style={{ margin: 0 }}>
            <strong>zero_available_sets</strong>: {formatNumber(assemblyIntelligence.zero_available_sets)}
          </p>
          <p style={{ margin: "8px 0 0" }}>
            <strong>availability_stats</strong>: min {formatNumber(availabilityStats.min)}, median{" "}
            {formatNumber(availabilityStats.median)}, max {formatNumber(availabilityStats.max)}
          </p>
          <div style={{ marginTop: 8 }}>
            <strong>top_bottlenecks</strong>
            {topBottlenecks.length === 0 ? (
              <p style={{ margin: "6px 0 0", color: "#666" }}>No data yet.</p>
            ) : (
              <ol style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {topBottlenecks.map((item, index) => (
                  <li key={`${String(item.component_sku ?? index)}-${index}`}>
                    {String(item.component_sku ?? "—")}: {formatNumber(item.count)}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </ControlTowerSection>

        <ControlTowerSection title="Deficit">
          <p style={{ margin: 0, color: "#374151" }}>Track shortage KPI and incidents in the dedicated page.</p>
          {deficitSummary ? (
            <p style={{ margin: "8px 0 0" }}>
              <strong>total_missing_qty</strong>: {formatNumber(deficitSummary.total_missing_qty)} · <strong>open_incidents</strong>: {" "}
              {formatNumber(deficitSummary.open_incidents)}
            </p>
          ) : null}
          <p style={{ margin: "10px 0 0" }}>
            <Link href="/kpi/deficit">Open Deficit KPI</Link>
          </p>
        </ControlTowerSection>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";

import { ControlTowerErrorState } from "./ControlTowerErrorState";
import { ControlTowerLoadingState } from "./ControlTowerLoadingState";
import { ControlTowerSection } from "./ControlTowerSection";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; payload: unknown };

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
        throw new Error(`Request failed with status ${response.status}`);
      }

      const payload = (await response.json()) as unknown;
      setState({ status: "ready", payload });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load Control Tower data.";
      setState({ status: "error", message });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.status === "loading") {
    return <ControlTowerLoadingState />;
  }

  if (state.status === "error") {
    return <ControlTowerErrorState message={state.message} onRetry={load} />;
  }

  const data = getRootPayload(state.payload);
  const recentEvents = getRecentEvents(data).slice(0, MAX_RECENT_EVENTS);

  return (
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
    </div>
  );
}

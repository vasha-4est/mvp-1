"use client";

import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useState } from "react";

import { formatDateTime as formatDateTimeCommon } from "@/lib/ui/formatDateTime";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; payload: unknown; errorMessage?: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => item !== null);
}

type ProductionPlanSection = {
  summary?: {
    shipment_count?: number | null;
    sku_count?: number | null;
    demand_qty?: number | null;
    available_qty?: number | null;
    covered_qty?: number | null;
    production_qty?: number | null;
    urgent_skus?: number | null;
  };
  items?: Array<{
    sku_id?: string | null;
    production_qty?: number | null;
    earliest_deadline_at?: string | null;
    priority_reason?: string | null;
  }>;
};

function formatNumber(value: unknown): string {
  return typeof value === "number" ? value.toLocaleString() : "—";
}

function formatDate(value: unknown): string {
  return formatDateTimeCommon(value);
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, background: "#fff" }}>
      <h2 style={{ margin: "0 0 10px", fontSize: 16 }}>{title}</h2>
      {children}
    </section>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p style={{ margin: 0, color: "#6b7280" }}>{message}</p>;
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
        setState({ status: "ready", payload: {}, errorMessage: `Request failed with status ${response.status}` });
        return;
      }

      const payload = (await response.json()) as unknown;
      setState({ status: "ready", payload });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load Control Tower data.";
      setState({ status: "ready", payload: {}, errorMessage: message });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.status === "loading") {
    return <p style={{ margin: 0 }}>Loading control tower…</p>;
  }

  const root = asRecord(state.payload) ?? {};
  const sections = asRecord(root.sections) ?? {};

  const deficit = asRecord(sections.deficit) ?? {};
  const topShort = asArray(deficit.top_short_skus);

  const shipmentsReadiness = asArray(sections.shipments_readiness);
  const productionPlan = asRecord(sections.production_plan) as ProductionPlanSection | null;
  const productionPlanSummary = asRecord(productionPlan?.summary) ?? {};
  const productionPlanItems = asArray(productionPlan?.items);

  const inventory = asRecord(sections.inventory) ?? {};
  const topAvailable = asArray(inventory.top_available);
  const lowStock = asArray(inventory.low_stock);

  const picking = asRecord(sections.picking) ?? {};

  const incidents = asRecord(sections.incidents) ?? {};
  const bySeverity = asRecord(incidents.by_severity) ?? {};

  const locks = asRecord(sections.locks) ?? {};
  const lockSample = asArray(locks.sample);

  const recentEvents = asArray(sections.recent_events);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {state.errorMessage ? <p style={{ margin: 0, color: "#b91c1c" }}>{state.errorMessage}</p> : null}

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <Section title="Deficit">
          <p style={{ margin: "0 0 8px" }}>
            <strong>Total missing qty:</strong> {formatNumber(deficit.total_missing_qty)}
          </p>
          {topShort.length === 0 ? (
            <EmptyState message="No short SKUs right now." />
          ) : (
            <ol style={{ margin: 0, paddingLeft: 18 }}>
              {topShort.map((item, idx) => (
                <li key={`${String(item.sku_id ?? idx)}-${idx}`}>
                  {String(item.sku_id ?? "—")}: {formatNumber(item.missing_qty)}
                </li>
              ))}
            </ol>
          )}
        </Section>

        <Section title="Shipments Readiness">
          {shipmentsReadiness.length === 0 ? (
            <EmptyState message="No shipments in readiness queue." />
          ) : (
            <ol style={{ margin: 0, paddingLeft: 18 }}>
              {shipmentsReadiness.map((item, idx) => (
                <li key={`${String(item.shipment_id ?? idx)}-${idx}`}>
                  {String(item.shipment_id ?? "—")}: {formatNumber(item.readiness_percent)}% ({String(item.status ?? "—")})
                </li>
              ))}
            </ol>
          )}
        </Section>

        <Section title="Production Plan">
          <p style={{ margin: "0 0 8px" }}>
            <strong>Demand:</strong> {formatNumber(productionPlanSummary.demand_qty)}
          </p>
          <p style={{ margin: "0 0 8px" }}>
            <strong>Production:</strong> {formatNumber(productionPlanSummary.production_qty)}
          </p>
          <p style={{ margin: "0 0 8px" }}>
            <strong>Urgent SKUs:</strong> {formatNumber(productionPlanSummary.urgent_skus)}
          </p>
          {productionPlanItems.length === 0 ? (
            <EmptyState message="No production plan priorities yet." />
          ) : (
            <ol style={{ margin: 0, paddingLeft: 18 }}>
              {productionPlanItems.map((item, idx) => (
                <li key={`${String(item.sku_id ?? idx)}-${idx}`}>
                  {String(item.sku_id ?? "—")}: {formatNumber(item.production_qty)} needed
                  {item.earliest_deadline_at ? `, deadline ${formatDate(item.earliest_deadline_at)}` : ""}
                </li>
              ))}
            </ol>
          )}
        </Section>

        <Section title="Inventory">
          <p style={{ margin: "0 0 8px" }}>
            <strong>updated_at_max:</strong> {formatDate(inventory.updated_at_max)}
          </p>
          <p style={{ margin: "0 0 6px" }}>
            <strong>Top available:</strong>
          </p>
          {topAvailable.length === 0 ? (
            <EmptyState message="No available inventory records." />
          ) : (
            <ul style={{ margin: "0 0 10px", paddingLeft: 18 }}>
              {topAvailable.map((item, idx) => (
                <li key={`${String(item.sku_id ?? idx)}-${idx}`}>
                  {String(item.sku_id ?? "—")} @ {String(item.location_id ?? "—")} — {formatNumber(item.available_qty)}
                </li>
              ))}
            </ul>
          )}
          <p style={{ margin: "0 0 6px" }}>
            <strong>Low stock (≤ 5):</strong>
          </p>
          {lowStock.length === 0 ? (
            <EmptyState message="No low stock items." />
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {lowStock.map((item, idx) => (
                <li key={`${String(item.sku_id ?? idx)}-low-${idx}`}>
                  {String(item.sku_id ?? "—")} @ {String(item.location_id ?? "—")} — {formatNumber(item.available_qty)}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Picking">
          <p style={{ margin: "0 0 6px" }}>
            <strong>Open lists:</strong> {formatNumber(picking.open_lists)}
          </p>
          <p style={{ margin: "0 0 6px" }}>
            <strong>Open lines:</strong> {formatNumber(picking.open_lines)}
          </p>
          <p style={{ margin: 0 }}>
            <strong>Last created:</strong> {formatDate(picking.last_created_at)}
          </p>
        </Section>

        <Section title="Incidents">
          <p style={{ margin: "0 0 8px" }}>
            <strong>Open total:</strong> {formatNumber(incidents.open_total)}
          </p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>low: {formatNumber(bySeverity.low)}</li>
            <li>medium: {formatNumber(bySeverity.medium)}</li>
            <li>high: {formatNumber(bySeverity.high)}</li>
            <li>critical: {formatNumber(bySeverity.critical)}</li>
          </ul>
        </Section>

        <Section title="Locks">
          <p style={{ margin: "0 0 8px" }}>
            <strong>Active total:</strong> {formatNumber(locks.active_total)}
          </p>
          {lockSample.length === 0 ? (
            <EmptyState message="No active locks." />
          ) : (
            <ol style={{ margin: 0, paddingLeft: 18 }}>
              {lockSample.map((item, idx) => (
                <li key={`${String(item.lock_key ?? idx)}-${idx}`}>
                  {String(item.lock_key ?? "—")} ({String(item.entity_type ?? "—")}/{String(item.entity_id ?? "—")})
                </li>
              ))}
            </ol>
          )}
        </Section>

        <Section title="Recent events">
          {recentEvents.length === 0 ? (
            <EmptyState message="No recent events." />
          ) : (
            <ol style={{ margin: 0, paddingLeft: 18 }}>
              {recentEvents.map((item, idx) => (
                <li key={`${String(item.event_id ?? idx)}-${idx}`}>
                  {String(item.event_type ?? "—")} — {String(item.entity_type ?? "—")}:{String(item.entity_id ?? "—")} —{" "}
                  {formatDate(item.created_at)}
                </li>
              ))}
            </ol>
          )}
        </Section>

        <Section title="KPI quick links">
          <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
            <li>
              <Link href="/kpi">KPI Dashboard</Link>
            </li>
            <li>
              <Link href="/kpi/throughput">Throughput (daily)</Link>
            </li>
            <li>
              <Link href="/kpi/throughput-shifts?days=14&tz=Europe%2FMoscow">Throughput by Shifts</Link>
            </li>
            <li>
              <Link href="/kpi/shipment-sla?days=14&tz=Europe%2FMoscow&sla_hours=24">Shipment SLA</Link>
            </li>
            <li>
              <Link href="/kpi/deficit">Deficit</Link>
            </li>
          </ul>
        </Section>
      </div>
    </div>
  );
}

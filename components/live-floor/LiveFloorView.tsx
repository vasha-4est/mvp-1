"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type ControlTowerSections = {
  deficit?: { total_missing_qty?: number | null };
  shipments_readiness?: Array<{ status?: string | null; readiness_percent?: number | null }>;
  picking?: { open_lists?: number | null };
  incidents?: { open_total?: number | null };
  locks?: { active_total?: number | null };
};

type ControlTowerPayload = {
  ok?: boolean;
  sections?: ControlTowerSections;
};

type KanbanColumn = {
  key: string;
  title: string;
  count: number;
};

type KanbanItem = {
  work_item_id: string;
  zone: string | null;
  station: string | null;
  task_type: string | null;
  status: string | null;
  priority: number | null;
  entity_id: string | null;
  entity_label: string | null;
  due_at: string | null;
};

type KanbanPayload = {
  ok?: boolean;
  columns?: KanbanColumn[];
  items?: KanbanItem[];
};

type LoadState =
  | { status: "loading"; data: null; hasError: false }
  | {
      status: "ready";
      data: {
        controlTower: ControlTowerPayload;
        kanban: KanbanPayload;
      };
      hasError: boolean;
    };

const QUICK_LINKS = [
  { href: "/batches", label: "Batches" },
  { href: "/drying", label: "Drying" },
  { href: "/packaging", label: "Packaging" },
  { href: "/stations/assembly", label: "Assembly" },
  { href: "/kpi/deficit", label: "Deficit KPI" },
  { href: "/shipments/readiness", label: "Shipments Readiness" },
  { href: "/control-tower", label: "Control Tower" },
];

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatNumber(value: number | null | undefined): string {
  return typeof value === "number" ? value.toLocaleString() : "—";
}

function formatDueAt(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function shipmentsSummary(items: ControlTowerSections["shipments_readiness"]): string {
  if (!Array.isArray(items) || items.length === 0) return "No shipments in readiness queue.";

  const avg =
    items
      .map((item) => asNumber(item?.readiness_percent))
      .filter((value): value is number => value !== null)
      .reduce((sum, value, _, arr) => sum + value / arr.length, 0) || 0;

  const byStatus = new Set(items.map((item) => item?.status).filter((value): value is string => Boolean(value)));
  return `${items.length} shipments, avg readiness ${Math.round(avg)}%${
    byStatus.size ? `, statuses: ${Array.from(byStatus).join(", ")}` : ""
  }`;
}

function Badge({ text }: { text: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        border: "1px solid #e5e7eb",
        borderRadius: 999,
        padding: "2px 8px",
        fontSize: 12,
        color: "#374151",
        background: "#f9fafb",
      }}
    >
      {text}
    </span>
  );
}

export function LiveFloorView() {
  const [state, setState] = useState<LoadState>({ status: "loading", data: null, hasError: false });

  const load = useCallback(async () => {
    setState({ status: "loading", data: null, hasError: false });

    try {
      const [controlTowerResponse, kanbanResponse] = await Promise.all([
        fetch("/api/control-tower", { method: "GET", cache: "no-store" }),
        fetch("/api/kanban?limit=200", { method: "GET", cache: "no-store" }),
      ]);

      if (!controlTowerResponse.ok || !kanbanResponse.ok) {
        throw new Error("Could not load Live Floor data. Please try again.");
      }

      const [controlTower, kanban] = (await Promise.all([
        controlTowerResponse.json(),
        kanbanResponse.json(),
      ])) as [ControlTowerPayload, KanbanPayload];

      setState({
        status: "ready",
        data: { controlTower, kanban },
        hasError: !(controlTower.ok && kanban.ok),
      });
    } catch {
      setState({
        status: "ready",
        hasError: true,
        data: {
          controlTower: {},
          kanban: { columns: [], items: [] },
        },
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const columns = useMemo(() => {
    if (state.status !== "ready") return [];
    return Array.isArray(state.data.kanban.columns) ? state.data.kanban.columns : [];
  }, [state]);

  const groupedItems = useMemo(() => {
    if (state.status !== "ready") return new Map<string, KanbanItem[]>();

    const map = new Map<string, KanbanItem[]>();
    const items = (Array.isArray(state.data.kanban.items) ? state.data.kanban.items : []).slice(0, 200);

    for (const item of items) {
      const status = item.status ?? "unknown";
      const current = map.get(status) ?? [];
      current.push(item);
      map.set(status, current);
    }

    return map;
  }, [state]);

  const sections = state.status === "ready" ? state.data.controlTower.sections ?? {} : {};

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {state.hasError ? (
        <div
          role="alert"
          style={{
            border: "1px solid #fecaca",
            background: "#fef2f2",
            color: "#b91c1c",
            borderRadius: 8,
            padding: 10,
          }}
        >
          Could not load Live Floor data. Please try again.
        </div>
      ) : null}

      <section style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, background: "#fff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Now</h2>
          <button type="button" onClick={() => void load()} style={{ padding: "6px 10px", cursor: "pointer" }}>
            Refresh
          </button>
        </div>
        <div style={{ display: "grid", gap: 10, marginTop: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10 }}>
            <div style={{ color: "#6b7280", fontSize: 12 }}>Deficit total missing qty</div>
            <strong>{formatNumber(sections.deficit?.total_missing_qty)}</strong>
          </div>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10 }}>
            <div style={{ color: "#6b7280", fontSize: 12 }}>Shipments readiness</div>
            <strong>{shipmentsSummary(sections.shipments_readiness)}</strong>
          </div>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10 }}>
            <div style={{ color: "#6b7280", fontSize: 12 }}>Picking open lists</div>
            <strong>{formatNumber(sections.picking?.open_lists)}</strong>
          </div>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10 }}>
            <div style={{ color: "#6b7280", fontSize: 12 }}>Incidents open total</div>
            <strong>{formatNumber(sections.incidents?.open_total)}</strong>
          </div>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10 }}>
            <div style={{ color: "#6b7280", fontSize: 12 }}>Locks active total</div>
            <strong>{formatNumber(sections.locks?.active_total)}</strong>
          </div>
        </div>
      </section>

      <section style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, background: "#fff" }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>Kanban</h2>
        {columns.length === 0 ? (
          <p style={{ margin: 0, color: "#6b7280" }}>
            No work items right now. When the floor creates tasks, they will appear here.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))" }}>
            {columns.map((column) => {
              const items = groupedItems.get(column.key) ?? [];

              return (
                <article key={column.key} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10 }}>
                  <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>
                    {column.title} ({items.length})
                  </h3>
                  <div style={{ display: "grid", gap: 8 }}>
                    {items.length === 0 ? (
                      <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>No items in this column.</p>
                    ) : (
                      items.map((item) => (
                        <div
                          key={item.work_item_id}
                          style={{ border: "1px solid #f3f4f6", borderRadius: 8, padding: 8, background: "#fcfcfd" }}
                        >
                          <strong style={{ display: "block" }}>{item.task_type || "task"}</strong>
                          <div style={{ fontSize: 13, color: "#374151" }}>{item.entity_label || item.entity_id || "—"}</div>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                            {item.zone ? <Badge text={`Zone: ${item.zone}`} /> : null}
                            {item.station ? <Badge text={`Station: ${item.station}`} /> : null}
                            {item.priority !== null ? <Badge text={`Priority: ${item.priority}`} /> : null}
                          </div>
                          <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>Due: {formatDueAt(item.due_at)}</div>
                        </div>
                      ))
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, background: "#fff" }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>Quick actions / Links</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {QUICK_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 999,
                padding: "6px 10px",
                color: "#1f2937",
                textDecoration: "none",
                background: "#fff",
              }}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

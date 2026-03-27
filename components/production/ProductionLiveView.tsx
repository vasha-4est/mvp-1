"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { formatDateTime } from "@/lib/ui/formatDateTime";

type ProductionPlanItem = {
  sku_id?: unknown;
  sku_name?: unknown;
  photo_url?: unknown;
  demand_qty?: unknown;
  inventory_qty?: unknown;
  available_qty?: unknown;
  production_qty?: unknown;
  shipment_count?: unknown;
  shipment_ids?: unknown;
  earliest_deadline_at?: unknown;
};

type ProductionPlanPayload = {
  ok?: boolean;
  generated_at?: unknown;
  import_batch_id?: unknown;
  items?: unknown;
};

type ProductionLaunchStatus = "new" | "in_progress" | "blocked" | "done";

type ProductionLaunchItem = {
  work_item_id?: unknown;
  import_batch_id?: unknown;
  sku_id?: unknown;
  status?: unknown;
  assignee_user_id?: unknown;
  assignee_username?: unknown;
  taken_at?: unknown;
  done_at?: unknown;
  blocked_reason?: unknown;
  done_qty?: unknown;
  production_qty?: unknown;
  batch_id?: unknown;
  batch_code?: unknown;
  shipment_ids?: unknown;
  earliest_deadline_at?: unknown;
};

type WorkerOption = {
  id?: unknown;
  username?: unknown;
};

type CatalogSkuItem = {
  sku_id?: unknown;
  sku_name?: unknown;
  photo_url?: unknown;
};

type ReadyState = {
  status: "ready";
  data: ProductionPlanPayload | null;
  launchItems: ProductionLaunchItem[];
  workers: WorkerOption[];
  catalogItems: CatalogSkuItem[];
  error: string | null;
  warning: string | null;
  refreshedAt: string;
};

type LoadState = { status: "loading" } | ReadyState;

const STATUS_COLORS: Record<ProductionLaunchStatus, { background: string; color: string; border: string }> = {
  new: { background: "#f3f4f6", color: "#374151", border: "#d1d5db" },
  in_progress: { background: "#dbeafe", color: "#1d4ed8", border: "#93c5fd" },
  blocked: { background: "#fee2e2", color: "#b91c1c", border: "#fca5a5" },
  done: { background: "#dcfce7", color: "#166534", border: "#86efac" },
};

const panelStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 16,
  background: "#fff",
} as const;

function asRawString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asInt(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.floor(value);
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? Math.floor(parsed) : 0;
  }
  return 0;
}

function asRows(data: ProductionPlanPayload | null): ProductionPlanItem[] {
  return Array.isArray(data?.items) ? (data.items as ProductionPlanItem[]) : [];
}

function asLaunchItems(value: unknown): ProductionLaunchItem[] {
  return Array.isArray(value) ? (value as ProductionLaunchItem[]) : [];
}

function asWorkers(value: unknown): WorkerOption[] {
  return Array.isArray(value) ? (value as WorkerOption[]) : [];
}

function asCatalogItems(value: unknown): CatalogSkuItem[] {
  return Array.isArray(value) ? (value as CatalogSkuItem[]) : [];
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => asRawString(item)).filter(Boolean);
}

function itemKey(importBatchId: string, skuId: string): string {
  return `${importBatchId}:${skuId}`;
}

function launchStatus(value: unknown): ProductionLaunchStatus {
  const candidate = asRawString(value).toLowerCase();
  return candidate === "in_progress" || candidate === "blocked" || candidate === "done" ? candidate : "new";
}

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <article style={{ ...panelStyle, padding: 14 }}>
      <div style={{ color: "#6b7280", fontSize: 12, marginBottom: 8 }}>{label}</div>
      <strong style={{ display: "block", fontSize: 28, lineHeight: 1.1 }}>{value}</strong>
      {note ? <small style={{ color: "#6b7280" }}>{note}</small> : null}
    </article>
  );
}

function StatusBadge({ status }: { status: ProductionLaunchStatus }) {
  const colors = STATUS_COLORS[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        borderRadius: 999,
        border: `1px solid ${colors.border}`,
        background: colors.background,
        color: colors.color,
        padding: "4px 10px",
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      {status}
    </span>
  );
}

export default function ProductionLiveView() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;
    if (silent) {
      setIsRefreshing(true);
    } else {
      setState({ status: "loading" });
    }

    try {
      const planResponse = await fetch("/api/production/plan", {
        method: "GET",
        cache: "no-store",
        credentials: "include",
      });
      const planPayload = (await planResponse.json().catch(() => null)) as ProductionPlanPayload | null;

      if (!planResponse.ok) {
        setState({
          status: "ready",
          data: null,
          launchItems: [],
          workers: [],
          catalogItems: [],
          error: "Не удалось загрузить production live view.",
          warning: null,
          refreshedAt: new Date().toISOString(),
        });
        return;
      }

      const importBatchId = asRawString(planPayload?.import_batch_id);
      let launchItems: ProductionLaunchItem[] = [];
      let workers: WorkerOption[] = [];
      let catalogItems: CatalogSkuItem[] = [];
      const warnings: string[] = [];

      try {
        const workersResponse = await fetch("/api/production/workers", {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        });
        const workersPayload = (await workersResponse.json().catch(() => null)) as { items?: unknown } | null;
        if (workersResponse.ok) {
          workers = asWorkers(workersPayload?.items);
        } else {
          warnings.push("Справочник сотрудников временно недоступен.");
        }
      } catch {
        warnings.push("Справочник сотрудников временно недоступен.");
      }

      try {
        const catalogResponse = await fetch("/api/catalog/skus", {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        });
        const catalogPayload = (await catalogResponse.json().catch(() => null)) as { items?: unknown } | null;
        if (catalogResponse.ok) {
          catalogItems = asCatalogItems(catalogPayload?.items);
        }
      } catch {
        warnings.push("Каталог SKU временно недоступен.");
      }

      if (importBatchId) {
        try {
          const launchResponse = await fetch(`/api/production/launch?import_batch_id=${encodeURIComponent(importBatchId)}`, {
            method: "GET",
            cache: "no-store",
            credentials: "include",
          });
          const launchPayload = (await launchResponse.json().catch(() => null)) as { items?: unknown } | null;
          if (launchResponse.ok) {
            launchItems = asLaunchItems(launchPayload?.items);
          } else {
            warnings.push("Launch state временно недоступен.");
          }
        } catch {
          warnings.push("Launch state временно недоступен.");
        }
      }

      setState({
        status: "ready",
        data: planPayload,
        launchItems,
        workers,
        catalogItems,
        error: null,
        warning: warnings.length > 0 ? warnings.join(" ") : null,
        refreshedAt: new Date().toISOString(),
      });
    } catch {
      setState({
        status: "ready",
        data: null,
        launchItems: [],
        workers: [],
        catalogItems: [],
        error: "Не удалось загрузить production live view.",
        warning: null,
        refreshedAt: new Date().toISOString(),
      });
    } finally {
      if (silent) {
        setIsRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const data = state.status === "ready" ? state.data : null;
  const rows = asRows(data);
  const launchItems = state.status === "ready" ? state.launchItems : [];
  const workers = state.status === "ready" ? state.workers : [];
  const catalogItems = state.status === "ready" ? state.catalogItems : [];

  const workerNameById = useMemo(
    () =>
      new Map(
        workers
          .map((worker) => [asRawString(worker.id), asRawString(worker.username)] as const)
          .filter((entry) => entry[0])
      ),
    [workers]
  );

  const catalogBySku = useMemo(
    () =>
      new Map(
        catalogItems
          .map((item) => [
            asRawString(item.sku_id),
            {
              sku_name: asRawString(item.sku_name),
              photo_url: asRawString(item.photo_url),
            },
          ] as const)
          .filter((entry) => entry[0])
      ),
    [catalogItems]
  );

  const launchByKey = useMemo(
    () =>
      new Map(
        launchItems.map((item) => [
          itemKey(asRawString(item.import_batch_id), asRawString(item.sku_id)),
          item,
        ] as const)
      ),
    [launchItems]
  );

  const liveItems = useMemo(() => {
    return rows.map((row) => {
      const key = itemKey(asRawString(data?.import_batch_id), asRawString(row.sku_id));
      const launch = launchByKey.get(key);
      const skuId = asRawString(row.sku_id);
      const status = launchStatus(launch?.status);
      const workerId = asRawString(launch?.assignee_user_id);
      const workerUsername = asRawString(launch?.assignee_username) || workerNameById.get(workerId) || "Не назначен";
      const catalog = catalogBySku.get(skuId);
      const plannedQty = asInt(launch?.production_qty || row.production_qty);
      const doneQty = Math.max(0, Math.min(plannedQty, asInt(launch?.done_qty)));
      const progressPercent = plannedQty > 0 ? Math.round((doneQty / plannedQty) * 100) : 0;

      return {
        key,
        skuId,
        productName: catalog?.sku_name || asRawString(row.sku_name) || skuId || "—",
        photoUrl: catalog?.photo_url || asRawString(row.photo_url),
        status,
        workerId,
        workerUsername,
        plannedQty,
        doneQty,
        progressPercent,
        takenAt: asRawString(launch?.taken_at),
        doneAt: asRawString(launch?.done_at),
        deadlineAt: asRawString(launch?.earliest_deadline_at || row.earliest_deadline_at),
        blockedReason: asRawString(launch?.blocked_reason),
        batchCode: asRawString(launch?.batch_code),
        batchId: asRawString(launch?.batch_id),
        shipmentIds: asStringList(launch?.shipment_ids).length > 0 ? asStringList(launch?.shipment_ids) : asStringList(row.shipment_ids),
      };
    });
  }, [catalogBySku, data?.import_batch_id, launchByKey, rows, workerNameById]);

  const activeItems = useMemo(() => liveItems.filter((item) => item.status === "in_progress"), [liveItems]);
  const blockedItems = useMemo(() => liveItems.filter((item) => item.status === "blocked"), [liveItems]);
  const queuedItems = useMemo(() => liveItems.filter((item) => item.status === "new"), [liveItems]);
  const doneItems = useMemo(() => liveItems.filter((item) => item.status === "done"), [liveItems]);

  const workerGroups = useMemo(() => {
    const groups = new Map<string, { workerId: string; workerUsername: string; items: typeof liveItems }>();

    for (const item of liveItems.filter((entry) => entry.status === "in_progress" || entry.status === "blocked")) {
      const groupKey = item.workerId || `unassigned:${item.key}`;
      const current = groups.get(groupKey) ?? {
        workerId: item.workerId,
        workerUsername: item.workerUsername,
        items: [],
      };
      current.items.push(item);
      groups.set(groupKey, current);
    }

    return Array.from(groups.values()).sort((left, right) => right.items.length - left.items.length || left.workerUsername.localeCompare(right.workerUsername));
  }, [liveItems]);

  const antiDupWatch = useMemo(() => {
    return [
      ...queuedItems.filter((item) => item.workerId),
      ...liveItems.filter((item) => (item.status === "in_progress" || item.status === "blocked") && !item.workerId),
    ];
  }, [liveItems, queuedItems]);

  const completedQty = useMemo(
    () => liveItems.reduce((sum, item) => sum + item.doneQty, 0),
    [liveItems]
  );

  const plannedQty = useMemo(
    () => liveItems.reduce((sum, item) => sum + item.plannedQty, 0),
    [liveItems]
  );

  const livePercent = plannedQty > 0 ? Math.round((completedQty / plannedQty) * 100) : 0;

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <div
        style={{
          borderRadius: 20,
          padding: 20,
          background: "linear-gradient(135deg, #111827 0%, #1f2937 60%, #334155 100%)",
          color: "#fff",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ maxWidth: 720 }}>
            <h1 style={{ margin: 0, fontSize: 32 }}>Production Live View</h1>
            <p style={{ margin: "10px 0 0", color: "rgba(255,255,255,0.82)", lineHeight: 1.5 }}>
              Кто сейчас в работе, где есть WIP и какие позиции нельзя запускать повторно, пока они уже закреплены или в процессе.
            </p>
          </div>
          <div style={{ display: "grid", gap: 10, justifyItems: "end" }}>
            <button
              type="button"
              onClick={() => void loadData({ silent: state.status === "ready" })}
              style={{
                border: "1px solid rgba(255,255,255,0.24)",
                background: "#fff",
                color: "#111827",
                borderRadius: 999,
                padding: "10px 16px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {isRefreshing ? "Обновляем..." : "Обновить сейчас"}
            </button>
            <small style={{ color: "rgba(255,255,255,0.72)" }}>
              Обновлено: {formatDateTime(state.status === "ready" ? state.refreshedAt : null)}
            </small>
            <small style={{ color: "rgba(255,255,255,0.72)" }}>
              Import batch: {asRawString(data?.import_batch_id) || "—"}
            </small>
          </div>
        </div>
      </div>

      {state.status === "loading" ? <p style={{ margin: 0, color: "#6b7280" }}>Загрузка live view…</p> : null}

      {state.status === "ready" && state.error ? (
        <div role="alert" style={{ ...panelStyle, borderColor: "#fecaca", background: "#fef2f2", color: "#991b1b" }}>
          {state.error}
        </div>
      ) : null}

      {state.status === "ready" && !state.error && state.warning ? (
        <div style={{ ...panelStyle, borderColor: "#fde68a", background: "#fffbeb", color: "#92400e" }}>{state.warning}</div>
      ) : null}

      {state.status === "ready" && !state.error ? (
        <>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            <Metric label="В работе" value={String(activeItems.length)} note="SKU со статусом in_progress" />
            <Metric label="Заблокировано" value={String(blockedItems.length)} note="Требуют внимания" />
            <Metric label="Активных людей" value={String(workerGroups.length)} note="Есть WIP или блок" />
            <Metric label="Выполнено" value={`${livePercent}%`} note={`${completedQty} из ${plannedQty}`} />
          </div>

          <section style={panelStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 20 }}>Кто делает что сейчас</h2>
                <p style={{ margin: "6px 0 0", color: "#6b7280" }}>Группировка по сотруднику для быстрого supervisor-прохода по активному WIP.</p>
              </div>
              <Link
                href="/production/plan"
                style={{
                  borderRadius: 999,
                  border: "1px solid #d1d5db",
                  padding: "10px 14px",
                  color: "#111827",
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                Открыть production plan
              </Link>
            </div>

            {workerGroups.length === 0 ? (
              <p style={{ margin: "16px 0 0", color: "#6b7280" }}>Сейчас нет активных launch items. Новые SKU появятся здесь после take/status update.</p>
            ) : (
              <div style={{ display: "grid", gap: 14, marginTop: 16, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
                {workerGroups.map((group) => (
                  <article key={`${group.workerId}:${group.workerUsername}`} style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 14, background: "#fcfcfd" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                      <div>
                        <strong style={{ fontSize: 18 }}>{group.workerUsername}</strong>
                        <div style={{ color: "#6b7280", fontSize: 13 }}>
                          {group.items.length} поз. в работе / блоке
                        </div>
                      </div>
                      <span style={{ borderRadius: 999, background: "#eef2ff", color: "#3730a3", padding: "6px 10px", fontWeight: 700 }}>
                        {group.items.reduce((sum, item) => sum + item.doneQty, 0)} / {group.items.reduce((sum, item) => sum + item.plannedQty, 0)}
                      </span>
                    </div>

                    <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
                      {group.items.map((item) => (
                        <div key={item.key} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fff" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                            <div>
                              <strong>{item.productName}</strong>
                              <div style={{ color: "#6b7280", fontSize: 12 }}>{item.skuId}</div>
                            </div>
                            <StatusBadge status={item.status} />
                          </div>
                          <div style={{ marginTop: 10, color: "#374151", fontSize: 14 }}>
                            WIP: {item.doneQty} / {item.plannedQty}
                          </div>
                          <div style={{ marginTop: 4, color: "#6b7280", fontSize: 13 }}>
                            Deadline: {formatDateTime(item.deadlineAt)}
                          </div>
                          <div style={{ marginTop: 4, color: "#6b7280", fontSize: 13 }}>
                            Started: {formatDateTime(item.takenAt)}
                          </div>
                          {item.blockedReason ? (
                            <div style={{ marginTop: 8, borderRadius: 10, background: "#fff7ed", color: "#9a3412", padding: "8px 10px", fontSize: 13 }}>
                              Блок: {item.blockedReason}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "minmax(0, 1.35fr) minmax(320px, 0.85fr)" }}>
            <section style={panelStyle}>
              <h2 style={{ margin: 0, fontSize: 20 }}>Анти-дублирование</h2>
              <p style={{ margin: "6px 0 0", color: "#6b7280" }}>
                Позиции ниже уже закреплены или находятся в работе. Их не нужно повторно забирать другим сотрудником.
              </p>

              {antiDupWatch.length === 0 ? (
                <p style={{ margin: "16px 0 0", color: "#6b7280" }}>Сейчас нет позиций с риском двойного запуска.</p>
              ) : (
                <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
                  {antiDupWatch.map((item) => (
                    <article key={`watch:${item.key}`} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fcfcfd" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                        <div>
                          <strong>{item.productName}</strong>
                          <div style={{ color: "#6b7280", fontSize: 12 }}>{item.skuId}</div>
                        </div>
                        <StatusBadge status={item.status} />
                      </div>
                      <div style={{ marginTop: 10, color: "#374151", fontSize: 14 }}>
                        {item.workerId
                          ? `Закреплено за: ${item.workerUsername}`
                          : "Есть активный статус без назначенного сотрудника. Нужна явная фиксация исполнителя."}
                      </div>
                      <div style={{ marginTop: 4, color: "#6b7280", fontSize: 13 }}>
                        WIP: {item.doneQty} / {item.plannedQty}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section style={panelStyle}>
              <h2 style={{ margin: 0, fontSize: 20 }}>Очередь запуска</h2>
              <p style={{ margin: "6px 0 0", color: "#6b7280" }}>
                Новые SKU, которые ещё не взяты в работу.
              </p>

              {queuedItems.length === 0 ? (
                <p style={{ margin: "16px 0 0", color: "#6b7280" }}>Очередь пуста: все позиции либо уже в работе, либо завершены.</p>
              ) : (
                <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
                  {queuedItems.map((item) => (
                    <article key={`queue:${item.key}`} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fff" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                        <div>
                          <strong>{item.productName}</strong>
                          <div style={{ color: "#6b7280", fontSize: 12 }}>{item.skuId}</div>
                        </div>
                        <StatusBadge status={item.status} />
                      </div>
                      <div style={{ marginTop: 8, color: "#374151", fontSize: 14 }}>
                        Нужно произвести: {item.plannedQty}
                      </div>
                      <div style={{ marginTop: 4, color: "#6b7280", fontSize: 13 }}>
                        Deadline: {formatDateTime(item.deadlineAt)}
                      </div>
                      {item.workerId ? (
                        <div style={{ marginTop: 8, borderRadius: 10, background: "#eff6ff", color: "#1d4ed8", padding: "8px 10px", fontSize: 13 }}>
                          Уже назначено на {item.workerUsername}. Другому сотруднику брать не нужно.
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>

          <section style={panelStyle}>
            <h2 style={{ margin: 0, fontSize: 20 }}>Срез по статусам</h2>
            <div style={{ display: "grid", gap: 12, marginTop: 16, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
              {[
                { title: "In progress", items: activeItems },
                { title: "Blocked", items: blockedItems },
                { title: "Done", items: doneItems },
              ].map((column) => (
                <article key={column.title} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fcfcfd" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                    <strong>{column.title}</strong>
                    <span style={{ color: "#6b7280" }}>{column.items.length}</span>
                  </div>
                  {column.items.length === 0 ? (
                    <p style={{ margin: "12px 0 0", color: "#6b7280", fontSize: 13 }}>Нет позиций.</p>
                  ) : (
                    <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                      {column.items.map((item) => (
                        <div key={`${column.title}:${item.key}`} style={{ borderRadius: 10, border: "1px solid #e5e7eb", padding: 10, background: "#fff" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                            <strong style={{ fontSize: 14 }}>{item.productName}</strong>
                            <StatusBadge status={item.status} />
                          </div>
                          <div style={{ marginTop: 6, color: "#6b7280", fontSize: 12 }}>
                            {item.workerUsername} • {item.doneQty}/{item.plannedQty}
                          </div>
                          {item.batchCode || item.batchId ? (
                            <div style={{ marginTop: 4, color: "#6b7280", fontSize: 12 }}>
                              Batch: {item.batchCode || item.batchId}
                            </div>
                          ) : null}
                          {item.shipmentIds.length > 0 ? (
                            <div style={{ marginTop: 4, color: "#6b7280", fontSize: 12 }}>
                              Shipments: {item.shipmentIds.join(", ")}
                            </div>
                          ) : null}
                          <div style={{ marginTop: 4, color: "#6b7280", fontSize: 12 }}>
                            Deadline: {formatDateTime(item.deadlineAt)}
                          </div>
                          {item.status === "done" ? (
                            <div style={{ marginTop: 4, color: "#6b7280", fontSize: 12 }}>
                              Done: {formatDateTime(item.doneAt)}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </section>
  );
}

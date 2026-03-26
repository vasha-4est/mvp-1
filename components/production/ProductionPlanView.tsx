"use client";

import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  summary?: {
    shipment_count?: unknown;
    sku_count?: unknown;
    covered_qty?: unknown;
    production_qty?: unknown;
    uncovered_qty?: unknown;
    urgent_skus?: unknown;
  };
  items?: unknown;
};

type ProductionLaunchStatus = "new" | "in_progress" | "blocked" | "done";
type SortColumn = "product" | "production_qty" | "done" | "progress" | "worker" | "status" | "inventory";
type SortDirection = "desc" | "asc" | null;

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
  batch_id?: unknown;
  batch_code?: unknown;
  shipment_ids?: unknown;
};

type WorkerOption = {
  id?: unknown;
  username?: unknown;
  roles?: unknown;
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
};

type LoadState = { status: "loading" } | ReadyState;

type Notice = {
  tone: "success" | "error";
  text: string;
};

const STATUS_OPTIONS: ProductionLaunchStatus[] = ["new", "in_progress", "blocked", "done"];

const controlStyle: CSSProperties = {
  height: 40,
  minHeight: 40,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#111827",
  fontSize: 14,
  lineHeight: "40px",
};

const buttonStyle: CSSProperties = {
  height: 40,
  minHeight: 40,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  background: "#111827",
  color: "#fff",
  fontSize: 14,
  fontWeight: 600,
};

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

function asNumber(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("ru-RU") : "—";
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
  return value.map((item) => asRawString(item)).filter((item) => item.length > 0);
}

function enrichPlanWithCatalog(
  plan: ProductionPlanPayload | null,
  catalogItems: CatalogSkuItem[]
): ProductionPlanPayload | null {
  if (!plan || !Array.isArray(plan.items) || catalogItems.length === 0) {
    return plan;
  }

  const catalogBySku = new Map(
    catalogItems
      .map((item) => [
        asRawString(item.sku_id),
        {
          sku_name: asRawString(item.sku_name),
          photo_url: asRawString(item.photo_url),
        },
      ] as const)
      .filter((entry) => entry[0].length > 0)
  );

  return {
    ...plan,
    items: (plan.items as ProductionPlanItem[]).map((item) => {
      const skuId = asRawString(item.sku_id);
      const catalogItem = catalogBySku.get(skuId);
      if (!catalogItem) {
        return item;
      }

      return {
        ...item,
        sku_name: catalogItem.sku_name || item.sku_name,
        photo_url: catalogItem.photo_url || item.photo_url,
      };
    }),
  };
}

function itemKey(importBatchId: string, skuId: string): string {
  return `${importBatchId}:${skuId}`;
}

function launchStatus(value: unknown): ProductionLaunchStatus {
  const candidate = asRawString(value).toLowerCase();
  return STATUS_OPTIONS.includes(candidate as ProductionLaunchStatus) ? (candidate as ProductionLaunchStatus) : "new";
}

function statusColors(status: ProductionLaunchStatus): { background: string; color: string; border: string } {
  if (status === "done") return { background: "#dcfce7", color: "#166534", border: "#86efac" };
  if (status === "in_progress") return { background: "#dbeafe", color: "#1d4ed8", border: "#93c5fd" };
  if (status === "blocked") return { background: "#fee2e2", color: "#b91c1c", border: "#fca5a5" };
  return { background: "#f3f4f6", color: "#374151", border: "#d1d5db" };
}

function deriveProductName(row: ProductionPlanItem): string {
  const explicitName = asRawString(row.sku_name);
  if (explicitName) return explicitName;
  const sku = asRawString(row.sku_id);
  return sku || "—";
}

function mergeLaunchItem(items: ProductionLaunchItem[], nextItem: ProductionLaunchItem): ProductionLaunchItem[] {
  const nextKey = itemKey(asRawString(nextItem.import_batch_id), asRawString(nextItem.sku_id));
  const rest = items.filter((item) => itemKey(asRawString(item.import_batch_id), asRawString(item.sku_id)) !== nextKey);
  return [...rest, nextItem];
}

function Metric({ label, value }: { label: string; value: unknown }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
      <p style={{ margin: "0 0 8px", color: "#6b7280" }}>{label}</p>
      <strong style={{ fontSize: 24 }}>{typeof value === "string" ? value : asNumber(value)}</strong>
    </div>
  );
}

function nextSortDirection(currentColumn: SortColumn | null, currentDirection: SortDirection, column: SortColumn): SortDirection {
  if (currentColumn !== column) return "desc";
  if (currentDirection === "desc") return "asc";
  if (currentDirection === "asc") return null;
  return "desc";
}

function sortIcon(active: boolean, direction: SortDirection): string {
  if (!active || direction === null) return "△▽";
  return direction === "desc" ? "▼" : "▲";
}

export default function ProductionPlanView() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [workerSelections, setWorkerSelections] = useState<Record<string, string>>({});
  const [statusSelections, setStatusSelections] = useState<Record<string, ProductionLaunchStatus>>({});
  const [blockedReasons, setBlockedReasons] = useState<Record<string, string>>({});
  const [doneQtyInputs, setDoneQtyInputs] = useState<Record<string, string>>({});
  const [pendingOps, setPendingOps] = useState<Record<string, number>>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | ProductionLaunchStatus>("all");
  const [workerFilter, setWorkerFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [pageSize, setPageSize] = useState<15 | 30>(15);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<SortColumn | null>("inventory");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const didInitLoadRef = useRef(false);

  const loadData = useCallback(async () => {
    setState({ status: "loading" });

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
          error: "Could not load production plan data. Please try again.",
          warning: null,
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
        if (workersResponse.ok) workers = asWorkers(workersPayload?.items);
      } catch {
        warnings.push("Worker directory is temporarily unavailable.");
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
        } else {
          warnings.push("Product catalog is temporarily unavailable.");
        }
      } catch {
        warnings.push("Product catalog is temporarily unavailable.");
      }

      if (importBatchId) {
        try {
          const launchResponse = await fetch(`/api/production/launch?import_batch_id=${encodeURIComponent(importBatchId)}`, {
            method: "GET",
            cache: "no-store",
            credentials: "include",
          });
          const launchPayload = (await launchResponse.json().catch(() => null)) as { items?: unknown } | null;
          if (launchResponse.ok) launchItems = asLaunchItems(launchPayload?.items);
        } catch {
          warnings.push("Launch state is temporarily unavailable.");
        }
      }

      setWorkerSelections((current) => {
        const next = { ...current };
        for (const item of launchItems) {
          next[itemKey(asRawString(item.import_batch_id), asRawString(item.sku_id))] = asRawString(item.assignee_user_id);
        }
        return next;
      });

      setStatusSelections((current) => {
        const next = { ...current };
        for (const item of launchItems) {
          next[itemKey(asRawString(item.import_batch_id), asRawString(item.sku_id))] = launchStatus(item.status);
        }
        return next;
      });

      setBlockedReasons((current) => {
        const next = { ...current };
        for (const item of launchItems) {
          next[itemKey(asRawString(item.import_batch_id), asRawString(item.sku_id))] = asRawString(item.blocked_reason);
        }
        return next;
      });

      setDoneQtyInputs((current) => {
        const next = { ...current };
        for (const item of launchItems) {
          next[itemKey(asRawString(item.import_batch_id), asRawString(item.sku_id))] = String(asInt(item.done_qty));
        }
        return next;
      });

      setState({
        status: "ready",
        data: enrichPlanWithCatalog(planPayload, catalogItems),
        launchItems,
        workers,
        catalogItems,
        error: null,
        warning: warnings.length > 0 ? warnings.join(" ") : null,
      });
    } catch {
      setState({
        status: "ready",
        data: null,
        launchItems: [],
        workers: [],
        catalogItems: [],
        error: "Could not load production plan data. Please try again.",
        warning: null,
      });
    }
  }, []);

  useEffect(() => {
    if (didInitLoadRef.current) return;
    didInitLoadRef.current = true;
    void loadData();
  }, [loadData]);

  const patchLaunchItem = useCallback((nextItem: ProductionLaunchItem) => {
    setState((current) => {
      if (current.status !== "ready") return current;
      return { ...current, launchItems: mergeLaunchItem(current.launchItems, nextItem) };
    });
    const key = itemKey(asRawString(nextItem.import_batch_id), asRawString(nextItem.sku_id));
    setWorkerSelections((current) => ({ ...current, [key]: asRawString(nextItem.assignee_user_id) }));
    setStatusSelections((current) => ({ ...current, [key]: launchStatus(nextItem.status) }));
    setBlockedReasons((current) => ({ ...current, [key]: asRawString(nextItem.blocked_reason) }));
    setDoneQtyInputs((current) => ({ ...current, [key]: String(asInt(nextItem.done_qty)) }));
  }, []);

  const submitLaunchAction = useCallback(
    async (
      row: ProductionPlanItem,
      updateAction: "take" | "assign" | "status",
      options?: {
        assigneeUserId?: string;
        assigneeUsername?: string;
        status?: ProductionLaunchStatus;
        blockedReason?: string;
        doneQty?: number;
        pendingToken?: string;
      }
    ) => {
      const readyState = state.status === "ready" ? state : null;
      const importBatchId = asRawString(readyState?.data?.import_batch_id);
      const skuId = asRawString(row.sku_id);
      const key = itemKey(importBatchId, skuId);

      if (!readyState || !importBatchId || !skuId) return;

      const selectedWorkerId = options?.assigneeUserId ?? workerSelections[key] ?? "";
      const selectedWorker = readyState.workers.find((item) => asRawString(item.id) === selectedWorkerId);
      const selectedStatus = options?.status ?? statusSelections[key] ?? "new";
      const blockedReason = options?.blockedReason ?? blockedReasons[key] ?? "";
      const doneQty = Math.max(0, Math.min(asInt(row.production_qty), options?.doneQty ?? asInt(doneQtyInputs[key])));
      const pendingToken = options?.pendingToken ?? `${key}:${updateAction}:${Date.now()}`;

      setPendingOps((current) => ({ ...current, [pendingToken]: 1 }));

      try {
        const response = await fetch("/api/production/launch", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            import_batch_id: importBatchId,
            sku_id: skuId,
            production_qty: asInt(row.production_qty),
            done_qty: doneQty,
            demand_qty: asInt(row.demand_qty),
            shipment_count: asInt(row.shipment_count),
            shipment_ids: asStringList((row as { shipment_ids?: unknown }).shipment_ids),
            earliest_deadline_at: asRawString(row.earliest_deadline_at) || null,
            priority_reason: asRawString(row.earliest_deadline_at)
              ? `Needs ${asInt(row.production_qty)} before ${asRawString(row.earliest_deadline_at)}`
              : `Needs ${asInt(row.production_qty)}`,
            update_action: updateAction,
            ...(updateAction === "assign"
              ? {
                  assignee_user_id: selectedWorkerId,
                  assignee_username: options?.assigneeUsername ?? asRawString(selectedWorker?.username),
                }
              : {}),
            ...(updateAction === "status"
              ? {
                  status: selectedStatus,
                  blocked_reason: selectedStatus === "blocked" ? blockedReason : null,
                }
              : {}),
          }),
        });

        const payload = (await response.json().catch(() => null)) as { item?: unknown } | null;
        if (response.ok && payload?.item) {
          patchLaunchItem(payload.item as ProductionLaunchItem);
        }
      } finally {
        setPendingOps((current) => {
          const next = { ...current };
          delete next[pendingToken];
          return next;
        });
      }
    },
    [blockedReasons, doneQtyInputs, patchLaunchItem, state, statusSelections, workerSelections]
  );

  const data = state.status === "ready" ? state.data : null;
  const rows = asRows(data);
  const summary = data?.summary ?? {};
  const hasImportBatch = typeof data?.import_batch_id === "string" && data.import_batch_id.trim().length > 0;
  const launchItems = state.status === "ready" ? state.launchItems : [];
  const workers = state.status === "ready" ? state.workers : [];
  const catalogItems = state.status === "ready" ? state.catalogItems : [];

  const launchByKey = useMemo(
    () => new Map(launchItems.map((item) => [itemKey(asRawString(item.import_batch_id), asRawString(item.sku_id)), item] as const)),
    [launchItems]
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

  const rowsWithMeta = useMemo(() => {
    return rows.map((row, index) => {
      const key = itemKey(asRawString(data?.import_batch_id), asRawString(row.sku_id));
      const launch = launchByKey.get(key);
      const status = statusSelections[key] ?? launchStatus(launch?.status);
      const workerId = workerSelections[key] ?? asRawString(launch?.assignee_user_id);
      const plannedQty = asInt(row.production_qty);
      const doneQty = Math.max(0, Math.min(plannedQty, asInt(doneQtyInputs[key] || launch?.done_qty)));
      const catalogItem = catalogBySku.get(asRawString(row.sku_id));

      return {
        originalIndex: index,
        row,
        key,
        launch,
        status,
        workerId,
        workerUsername: asRawString(workers.find((worker) => asRawString(worker.id) === workerId)?.username),
        plannedQty,
        doneQty,
        progressPercent: plannedQty > 0 ? Math.round((doneQty / plannedQty) * 100) : 0,
        blockedReason: blockedReasons[key] ?? asRawString(launch?.blocked_reason),
        productName: catalogItem?.sku_name || deriveProductName(row),
        photoUrl: catalogItem?.photo_url || asRawString(row.photo_url),
        inventoryQty: asInt(row.inventory_qty || row.available_qty),
        batchCode: asRawString(launch?.batch_code),
        batchId: asRawString(launch?.batch_id),
        shipmentIds: asStringList((row as { shipment_ids?: unknown }).shipment_ids),
      };
    });
  }, [blockedReasons, catalogBySku, data?.import_batch_id, doneQtyInputs, launchByKey, rows, statusSelections, workerSelections, workers]);

  const filteredRows = useMemo(() => {
    const filtered = rowsWithMeta.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (workerFilter !== "all" && item.workerId !== workerFilter) return false;
      if (searchQuery.trim()) {
        const haystack = [
          item.productName,
          asRawString(item.row.sku_id),
          item.batchCode,
          item.batchId,
          ...item.shipmentIds,
        ]
          .join(" ")
          .toLowerCase();

        if (!haystack.includes(searchQuery.trim().toLowerCase())) {
          return false;
        }
      }
      return true;
    });

    const direction = sortDirection ?? "asc";
    const factor = direction === "desc" ? -1 : 1;
    const activeSort = sortColumn ?? "inventory";

    return [...filtered].sort((left, right) => {
      let cmp = 0;
      if (activeSort === "product") cmp = asRawString(left.row.sku_id).localeCompare(asRawString(right.row.sku_id));
      if (activeSort === "production_qty") cmp = left.plannedQty - right.plannedQty;
      if (activeSort === "done") cmp = left.doneQty - right.doneQty;
      if (activeSort === "progress") cmp = left.progressPercent - right.progressPercent;
      if (activeSort === "worker") cmp = (left.workerUsername || "zzz").localeCompare(right.workerUsername || "zzz");
      if (activeSort === "status") cmp = left.status.localeCompare(right.status);
      if (activeSort === "inventory") cmp = left.inventoryQty - right.inventoryQty;
      if (cmp === 0) cmp = left.originalIndex - right.originalIndex;
      return cmp * factor;
    });
  }, [rowsWithMeta, searchQuery, sortColumn, sortDirection, statusFilter, workerFilter]);

  const aggregateProgress = useMemo(
    () =>
      rowsWithMeta.reduce(
        (acc, item) => {
          acc.doneQty += item.doneQty;
          acc.plannedQty += item.plannedQty;
          return acc;
        },
        { doneQty: 0, plannedQty: 0 }
      ),
    [rowsWithMeta]
  );

  const aggregatePercent = aggregateProgress.plannedQty > 0 ? Math.round((aggregateProgress.doneQty / aggregateProgress.plannedQty) * 100) : 0;
  const requiredPerWorkday = aggregateProgress.plannedQty > 0 ? (aggregateProgress.plannedQty / 5).toFixed(1).replace(".", ",") : "0";

  const statusCounts = useMemo(() => {
    const counts: Record<"all" | ProductionLaunchStatus, number> = { all: rowsWithMeta.length, new: 0, in_progress: 0, blocked: 0, done: 0 };
    for (const item of rowsWithMeta) counts[item.status] += 1;
    return counts;
  }, [rowsWithMeta]);

  const uniqueWorkers = useMemo(
    () =>
      workers
        .map((worker) => ({ id: asRawString(worker.id), username: asRawString(worker.username) }))
        .filter((worker) => worker.id && worker.username),
    [workers]
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [pageSize, searchQuery, statusFilter, workerFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pagedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, pageSize, safePage]);

  const toggleSort = (column: SortColumn) => {
    const nextDirection = nextSortDirection(sortColumn, sortDirection, column);
    setSortColumn(nextDirection === null ? null : column);
    setSortDirection(nextDirection);
  };

  const headerCell = (label: string, column: SortColumn) => (
    <button
      type="button"
      onClick={() => toggleSort(column)}
      style={{
        border: 0,
        background: "transparent",
        padding: 0,
        font: "inherit",
        fontWeight: 700,
        color: "#111827",
        cursor: "pointer",
        whiteSpace: "nowrap",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
      }}
    >
      <span>{label}</span>
      <small style={{ color: "#9ca3af", whiteSpace: "nowrap" }}>{sortIcon(sortColumn === column, sortDirection)}</small>
    </button>
  );

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Production Launch</h1>
          <p style={{ margin: "6px 0 0", color: "#4b5563" }}>Launch actionable SKUs from the current production plan (PR-119)</p>
        </div>
        <button type="button" onClick={loadData} disabled={state.status === "loading"} style={buttonStyle}>
          {state.status === "loading" ? "Loading..." : "Refresh"}
        </button>
      </div>

      <p style={{ margin: 0, color: "#6b7280" }}>Last updated: {formatDateTime(data?.generated_at)}</p>
      <p style={{ margin: 0, color: "#6b7280" }}>Import batch: {asString(data?.import_batch_id)}</p>

      {notice ? (
        <p role="status" style={{ margin: 0, padding: "10px 12px", borderRadius: 6, background: notice.tone === "success" ? "#ecfdf5" : "#fef2f2", color: notice.tone === "success" ? "#166534" : "#991b1b" }}>
          {notice.text}
        </p>
      ) : null}

      {state.status === "loading" ? <p style={{ margin: 0, color: "#6b7280" }}>Loading…</p> : null}

      {state.status === "ready" && state.error ? (
        <p role="alert" style={{ margin: 0, padding: "10px 12px", background: "#fef2f2", color: "#991b1b", borderRadius: 6 }}>
          {state.error}
        </p>
      ) : null}

      {state.status === "ready" && !state.error && state.warning ? (
        <p role="status" style={{ margin: 0, padding: "10px 12px", background: "#fffbeb", color: "#92400e", borderRadius: 6 }}>
          {state.warning}
        </p>
      ) : null}

      {state.status === "ready" && !state.error ? (
        <div style={{ display: "grid", gap: 16 }}>
          <article style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 14, background: "#fff" }}>
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
              <Metric label="Shipments" value={summary.shipment_count} />
              <Metric label="SKUs" value={summary.sku_count} />
              <Metric label="Production" value={summary.production_qty} />
              <Metric label="Per day (5d)" value={requiredPerWorkday} />
              <Metric label="Completed qty" value={aggregateProgress.doneQty} />
              <Metric label="Plan done" value={`${aggregatePercent}%`} />
            </div>
          </article>

          <article style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 14, background: "#fff", display: "grid", gap: 12 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(["all", ...STATUS_OPTIONS] as const).map((status) => {
                const isActive = statusFilter === status;
                const colors = status === "all" ? { background: "#111827", color: "#fff", border: "#111827" } : statusColors(status);
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setStatusFilter(status)}
                    style={{
                      borderRadius: 999,
                      border: `1px solid ${isActive ? colors.border : "#d1d5db"}`,
                      background: isActive ? colors.background : "#fff",
                      color: isActive ? colors.color : "#374151",
                      padding: "8px 12px",
                      fontWeight: 600,
                    }}
                  >
                    {status === "all" ? `all (${statusCounts.all})` : `${status} (${statusCounts[status]})`}
                  </button>
                );
              })}
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, color: "#6b7280" }}>Worker</span>
                <select value={workerFilter} onChange={(event) => setWorkerFilter(event.target.value)} style={{ ...controlStyle, width: 210 }}>
                  <option value="all">All workers</option>
                  {uniqueWorkers.map((worker) => (
                    <option key={worker.id} value={worker.id}>
                      {worker.username}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, color: "#6b7280" }}>Search</span>
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Product, SKU, Batch ID, Shipment ID"
                  style={{ ...controlStyle, width: 280, lineHeight: "normal" }}
                />
              </label>
            </div>
          </article>

          <article style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 14, background: "#fff" }}>
            {filteredRows.length === 0 ? (
              <p style={{ margin: 0, color: "#6b7280" }}>
                {hasImportBatch ? "No партии match the current filters." : "No staged shipment plan is available yet."}
              </p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1380, tableLayout: "fixed" }}>
                  <colgroup>
                    <col style={{ width: 80 }} />
                    <col style={{ width: 180 }} />
                    <col style={{ width: 120 }} />
                    <col style={{ width: 130 }} />
                    <col style={{ width: 120 }} />
                    <col style={{ width: 190 }} />
                    <col style={{ width: 190 }} />
                    <col style={{ width: 120 }} />
                    <col style={{ width: 120 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th align="left" style={{ borderBottom: "1px solid #e5e7eb", padding: "0 12px 10px 0" }}>photo</th>
                      <th align="left" style={{ borderBottom: "1px solid #e5e7eb", padding: "0 12px 10px 0" }}>{headerCell("product", "product")}</th>
                      <th align="center" style={{ borderBottom: "1px solid #e5e7eb", padding: "0 12px 10px 0", borderRight: "1px dashed #e5e7eb" }}>{headerCell("production_qty", "production_qty")}</th>
                      <th align="center" style={{ borderBottom: "1px solid #e5e7eb", padding: "0 12px 10px 0" }}>{headerCell("done", "done")}</th>
                      <th align="center" style={{ borderBottom: "1px solid #e5e7eb", padding: "0 12px 10px 0" }}>{headerCell("progress", "progress")}</th>
                      <th align="center" style={{ borderBottom: "1px solid #e5e7eb", padding: "0 12px 10px 0" }}>{headerCell("worker", "worker")}</th>
                      <th align="center" style={{ borderBottom: "1px solid #e5e7eb", padding: "0 12px 10px 0", borderRight: "1px dashed #e5e7eb" }}>{headerCell("status", "status")}</th>
                      <th align="center" style={{ borderBottom: "1px solid #e5e7eb", padding: "0 12px 10px 0" }}>{headerCell("inventory", "inventory")}</th>
                      <th align="left" style={{ borderBottom: "1px solid #e5e7eb", padding: "0 12px 10px 0" }}>shipments</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRows.map((item) => {
                      const workerSavePending = Object.keys(pendingOps).some((token) => token.startsWith(`${item.key}:assign:`));
                      const statusSavePending = Object.keys(pendingOps).some((token) => token.startsWith(`${item.key}:status:`));
                      const takePending = Object.keys(pendingOps).some((token) => token.startsWith(`${item.key}:take:`));
                      const colors = statusColors(item.status);
                      const isNew = item.status === "new";
                      const batchLabel = item.batchCode || item.batchId;
                      const doneInputDisabled = item.status === "done";

                      return (
                        <tr key={item.key}>
                          <td style={{ padding: "14px 12px 14px 0", borderBottom: "1px solid #e5e7eb", verticalAlign: "top" }}>
                            {item.photoUrl ? (
                              <img src={item.photoUrl} alt={item.productName} style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 10, border: "1px solid #e5e7eb" }} />
                            ) : (
                              <div style={{ width: 48, height: 48, borderRadius: 10, border: "1px solid #e5e7eb", background: "#f3f4f6" }} />
                            )}
                          </td>

                          <td style={{ padding: "25px 12px 14px 0", borderBottom: "1px solid #e5e7eb", verticalAlign: "top" }}>
                            <strong>{item.productName}</strong>
                            <br />
                            <small style={{ color: "#6b7280" }}>{asRawString(item.row.sku_id)}</small>
                          </td>

                          <td align="center" style={{ padding: "25px 12px 14px 0", borderBottom: "1px solid #e5e7eb", borderRight: "1px dashed #e5e7eb", verticalAlign: "top" }}>
                            <strong>{item.plannedQty.toLocaleString("ru-RU")}</strong>
                          </td>

                          <td style={{ padding: "14px 12px 14px 14px", borderBottom: "1px solid #e5e7eb", verticalAlign: "top" }}>
                            <input
                              type="number"
                              min={0}
                              max={item.plannedQty}
                              value={doneQtyInputs[item.key] ?? String(item.doneQty)}
                              disabled={doneInputDisabled}
                              onChange={(event) => setDoneQtyInputs((current) => ({ ...current, [item.key]: event.target.value }))}
                              onBlur={() => {
                                if (doneInputDisabled) return;
                                void submitLaunchAction(item.row, "status", {
                                  status: item.status,
                                  blockedReason: item.blockedReason,
                                  doneQty: asInt(doneQtyInputs[item.key]),
                                  pendingToken: `${item.key}:status:${Date.now()}`,
                                });
                              }}
                              onKeyDown={(event) => {
                                if (doneInputDisabled) return;
                                if (event.key !== "Enter") return;
                                event.preventDefault();
                                void submitLaunchAction(item.row, "status", {
                                  status: item.status,
                                  blockedReason: item.blockedReason,
                                  doneQty: asInt(doneQtyInputs[item.key]),
                                  pendingToken: `${item.key}:status:${Date.now()}`,
                                });
                              }}
                              style={{
                                ...controlStyle,
                                width: 88,
                                opacity: doneInputDisabled ? 0.65 : 1,
                                background: doneInputDisabled ? "#f9fafb" : "#fff",
                              }}
                            />
                            {batchLabel ? (
                              <>
                                <br />
                                <small style={{ color: "#6b7280" }}>batch: {batchLabel}</small>
                              </>
                            ) : null}
                          </td>

                          <td align="center" style={{ padding: "24px 12px 14px 0", borderBottom: "1px solid #e5e7eb", verticalAlign: "top" }}>
                            {item.progressPercent}%
                          </td>

                          <td style={{ padding: "14px 12px 14px 0", borderBottom: "1px solid #e5e7eb", verticalAlign: "top" }}>
                            <select
                              value={item.workerId}
                              onChange={(event) => {
                                const nextWorkerId = event.target.value;
                                const nextWorker = workers.find((worker) => asRawString(worker.id) === nextWorkerId);
                                setWorkerSelections((current) => ({ ...current, [item.key]: nextWorkerId }));
                                void submitLaunchAction(item.row, "assign", {
                                  assigneeUserId: nextWorkerId,
                                  assigneeUsername: asRawString(nextWorker?.username),
                                  status: item.status,
                                  blockedReason: item.blockedReason,
                                  doneQty: item.doneQty,
                                  pendingToken: `${item.key}:assign:${Date.now()}`,
                                });
                              }}
                              style={{ ...controlStyle, width: 180 }}
                            >
                              <option value="">Select worker</option>
                              {workers.map((worker) => (
                                <option key={asRawString(worker.id) || asRawString(worker.username)} value={asRawString(worker.id)}>
                                  {asRawString(worker.username)}
                                </option>
                              ))}
                            </select>
                            {item.launch?.taken_at ? (
                              <>
                                <br />
                                <small style={{ color: "#6b7280" }}>taken: {formatDateTime(item.launch?.taken_at)}</small>
                              </>
                            ) : null}
                            <br />
                            <small style={{ color: "#6b7280" }}>{workerSavePending ? "Saving..." : " "}</small>
                          </td>

                          <td style={{ padding: "14px 12px 14px 0", borderBottom: "1px solid #e5e7eb", borderRight: "1px dashed #e5e7eb", verticalAlign: "top" }}>
                            {isNew ? (
                              <button
                                type="button"
                                onClick={() => {
                                  void submitLaunchAction(item.row, "take", {
                                    doneQty: item.doneQty,
                                    pendingToken: `${item.key}:take:${Date.now()}`,
                                  });
                                }}
                                style={{ ...buttonStyle, width: 180 }}
                              >
                                {takePending ? "Taking..." : "Take into work"}
                              </button>
                            ) : (
                              <select
                                value={item.status}
                                onChange={(event) => {
                                  const nextStatus = event.target.value as ProductionLaunchStatus;
                                  setStatusSelections((current) => ({ ...current, [item.key]: nextStatus }));
                                  if (nextStatus === "blocked" && !item.blockedReason.trim()) return;
                                  void submitLaunchAction(item.row, "status", {
                                    status: nextStatus,
                                    blockedReason: item.blockedReason,
                                    doneQty: item.doneQty,
                                    pendingToken: `${item.key}:status:${Date.now()}`,
                                  });
                                }}
                                style={{ ...controlStyle, width: 180, background: colors.background, color: colors.color, borderColor: colors.border }}
                              >
                                {STATUS_OPTIONS.filter((status) => status !== "new").map((status) => (
                                  <option key={status} value={status}>
                                    {status}
                                  </option>
                                ))}
                              </select>
                            )}
                            {item.status === "blocked" ? (
                              <input
                                value={blockedReasons[item.key] ?? item.blockedReason}
                                placeholder="Blocked reason"
                                onChange={(event) => setBlockedReasons((current) => ({ ...current, [item.key]: event.target.value }))}
                                onBlur={() => {
                                  const nextReason = blockedReasons[item.key] ?? item.blockedReason;
                                  if (!nextReason.trim()) return;
                                  void submitLaunchAction(item.row, "status", {
                                    status: "blocked",
                                    blockedReason: nextReason,
                                    doneQty: item.doneQty,
                                    pendingToken: `${item.key}:status:${Date.now()}`,
                                  });
                                }}
                                style={{ ...controlStyle, width: 180, marginTop: 8 }}
                              />
                            ) : null}
                            {item.launch?.done_at ? (
                              <>
                                <br />
                                <small style={{ color: "#6b7280" }}>done: {formatDateTime(item.launch?.done_at)}</small>
                              </>
                            ) : null}
                            <br />
                            <small style={{ color: "#6b7280" }}>{statusSavePending ? "Saving..." : " "}</small>
                          </td>

                          <td align="center" style={{ padding: "14px 12px 14px 0", borderBottom: "1px solid #e5e7eb", verticalAlign: "top" }}>
                            {item.inventoryQty.toLocaleString("ru-RU")}
                          </td>

                          <td style={{ padding: "14px 12px 14px 0", borderBottom: "1px solid #e5e7eb", verticalAlign: "top" }}>
                            {asNumber(item.row.demand_qty)}
                            <br />
                            <small style={{ color: "#6b7280" }}>{formatDateTime(item.row.earliest_deadline_at)}</small>
                            <br />
                            {item.shipmentIds.length > 0 ? (
                              <>
                                <small style={{ color: "#6b7280" }}>{item.shipmentIds.join(", ")}</small>
                              </>
                            ) : null}                       
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </article>

          {filteredRows.length > 0 ? (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, color: "#6b7280" }}>
                <span>Rows</span>
                <select
                  value={pageSize}
                  onChange={(event) => setPageSize(Number(event.target.value) as 15 | 30)}
                  style={{ ...controlStyle, width: 88 }}
                >
                  <option value={15}>15</option>
                  <option value={30}>30</option>
                </select>
              </label>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={safePage <= 1}
                  style={{ ...buttonStyle, opacity: safePage <= 1 ? 0.5 : 1 }}
                >
                  Prev
                </button>
                <small style={{ color: "#6b7280" }}>
                  Page {safePage} / {totalPages}
                </small>
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  disabled={safePage >= totalPages}
                  style={{ ...buttonStyle, opacity: safePage >= totalPages ? 0.5 : 1 }}
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

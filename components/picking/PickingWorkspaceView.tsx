"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { formatDateTime } from "@/lib/ui/formatDateTime";

type PickingListSummary = {
  picking_list_id?: unknown;
  created_at?: unknown;
  status?: unknown;
  warehouse_key?: unknown;
  shipment_id?: unknown;
  direction?: unknown;
  counterparty?: unknown;
  destination?: unknown;
  destination_warehouse?: unknown;
  planned_date?: unknown;
  deadline_at?: unknown;
  planned_lines?: unknown;
  planned_qty?: unknown;
};

type PickingLine = {
  line_id?: unknown;
  sku_id?: unknown;
  planned_qty?: unknown;
  picked_qty?: unknown;
  status?: unknown;
  task_status?: unknown;
};

type ShipmentSummary = {
  shipment_id?: unknown;
  created_at?: unknown;
  status?: unknown;
  direction?: unknown;
  counterparty?: unknown;
  destination?: unknown;
  destination_warehouse?: unknown;
  planned_date?: unknown;
  deadline_at?: unknown;
  warehouse_key?: unknown;
  planned_lines?: unknown;
  planned_qty?: unknown;
};

type ShipmentLine = {
  line_id?: unknown;
  sku_id?: unknown;
  planned_qty?: unknown;
  picked_qty?: unknown;
  status?: unknown;
};

type PickingDraftLine = {
  draft_line_id?: unknown;
  shipment_line_id?: unknown;
  sku_id?: unknown;
  planned_qty?: unknown;
  picked_qty?: unknown;
  outstanding_qty?: unknown;
  location_id?: unknown;
  available_qty?: unknown;
  suggested_qty?: unknown;
  short_qty?: unknown;
  state?: unknown;
  updated_at?: unknown;
};

type PickingDraftPayload = {
  ok?: boolean;
  shipment?: ShipmentSummary;
  summary?: {
    shipment_line_count?: unknown;
    actionable_line_count?: unknown;
    shortage_line_count?: unknown;
    total_outstanding_qty?: unknown;
    total_suggested_qty?: unknown;
    total_short_qty?: unknown;
  };
  lines?: unknown;
  error?: unknown;
};

type CatalogSkuItem = {
  sku_id?: unknown;
  sku_name?: unknown;
};

type LoadState =
  | { status: "loading" }
  | {
      status: "ready";
      pickingLists: PickingListSummary[];
      shipments: ShipmentSummary[];
      catalogItems: CatalogSkuItem[];
      error: string | null;
      warning: string | null;
      refreshedAt: string;
    };

type Notice = {
  tone: "success" | "error";
  text: string;
};

type FilterStatus = "all" | string;
type PageSize = 5 | 10 | 20;

const panelStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 16,
  background: "#fff",
} as const;

const buttonStyle = {
  border: "1px solid #111827",
  borderRadius: 10,
  background: "#111827",
  color: "#fff",
  minHeight: 40,
  padding: "0 14px",
  fontSize: 14,
  fontWeight: 600,
} as const;

const secondaryButtonStyle = {
  border: "1px solid #d1d5db",
  borderRadius: 10,
  background: "#fff",
  color: "#111827",
  minHeight: 40,
  padding: "0 14px",
  fontSize: 14,
  fontWeight: 600,
} as const;

const inputStyle = {
  border: "1px solid #d1d5db",
  borderRadius: 10,
  minHeight: 40,
  padding: "0 12px",
  fontSize: 14,
  background: "#fff",
  color: "#111827",
} as const;

const controlStyle = {
  border: "1px solid #d1d5db",
  borderRadius: 10,
  minHeight: 40,
  padding: "0 12px",
  fontSize: 14,
  background: "#fff",
  color: "#111827",
} as const;

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

function asPickingLists(value: unknown): PickingListSummary[] {
  return Array.isArray(value) ? (value as PickingListSummary[]) : [];
}

function asPickingLines(value: unknown): PickingLine[] {
  return Array.isArray(value) ? (value as PickingLine[]) : [];
}

function asShipments(value: unknown): ShipmentSummary[] {
  return Array.isArray(value) ? (value as ShipmentSummary[]) : [];
}

function asShipmentLines(value: unknown): ShipmentLine[] {
  return Array.isArray(value) ? (value as ShipmentLine[]) : [];
}

function asCatalogItems(value: unknown): CatalogSkuItem[] {
  return Array.isArray(value) ? (value as CatalogSkuItem[]) : [];
}

function asPickingDraftLines(value: unknown): PickingDraftLine[] {
  return Array.isArray(value) ? (value as PickingDraftLine[]) : [];
}

function isOpenStatus(value: unknown): boolean {
  const status = asRawString(value).toLowerCase();
  return status !== "done" && status !== "completed" && status !== "closed";
}

function statusChipStyle(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "ready" || normalized === "done" || normalized === "completed") {
    return { background: "#ecfdf5", color: "#166534", border: "#86efac" };
  }
  if (normalized === "partial_ready" || normalized === "in_progress") {
    return { background: "#eff6ff", color: "#1d4ed8", border: "#93c5fd" };
  }
  if (normalized === "not_ready" || normalized === "blocked" || normalized === "short") {
    return { background: "#fef2f2", color: "#991b1b", border: "#fca5a5" };
  }
  return { background: "#f3f4f6", color: "#374151", border: "#d1d5db" };
}

function toneStyle(tone: Notice["tone"]) {
  if (tone === "success") {
    return { background: "#ecfdf5", color: "#166534", border: "1px solid #86efac" } as const;
  }

  return { background: "#fef2f2", color: "#991b1b", border: "1px solid #fca5a5" } as const;
}

function formatDate(value: unknown): string {
  return formatDateTime(value, { mode: "date" });
}

function shipmentContextLabel(shipment: ShipmentSummary | null | undefined): string {
  const counterparty = asRawString(shipment?.counterparty);
  const destinationWarehouse = asRawString(shipment?.destination_warehouse);
  const destination = asRawString(shipment?.destination);
  return counterparty || destinationWarehouse || destination
    ? [counterparty || "—", destinationWarehouse || destination || "—"].join(" -> ")
    : "—";
}

function pickingContextLabel(pickingList: PickingListSummary | null | undefined): string {
  const counterparty = asRawString(pickingList?.counterparty);
  const destinationWarehouse = asRawString(pickingList?.destination_warehouse);
  const destination = asRawString(pickingList?.destination);
  return counterparty || destinationWarehouse || destination
    ? [counterparty || "—", destinationWarehouse || destination || "—"].join(" -> ")
    : "—";
}

function paginate<T>(items: T[], page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    totalPages,
    safePage,
    items: items.slice(start, start + pageSize),
  };
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

function StatusChips(props: {
  statuses: string[];
  active: FilterStatus;
  counts: Record<string, number>;
  onChange: (status: FilterStatus) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {(["all", ...props.statuses] as const).map((status) => {
        const isActive = props.active === status;
        const palette = status === "all" ? { background: "#111827", color: "#fff", border: "#111827" } : statusChipStyle(status);
        return (
          <button
            key={status}
            type="button"
            onClick={() => props.onChange(status)}
            style={{
              borderRadius: 999,
              border: `1px solid ${isActive ? palette.border : "#d1d5db"}`,
              background: isActive ? palette.background : "#fff",
              color: isActive ? palette.color : "#374151",
              padding: "8px 12px",
              fontWeight: 600,
            }}
          >
            {status === "all" ? `all (${props.counts.all ?? 0})` : `${status} (${props.counts[status] ?? 0})`}
          </button>
        );
      })}
    </div>
  );
}

function PaginationControls(props: {
  label: string;
  pageSize: PageSize;
  onPageSizeChange: (size: PageSize) => void;
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <label style={{ display: "flex", alignItems: "center", gap: 8, color: "#6b7280" }}>
        <span>{props.label}</span>
        <select
          value={props.pageSize}
          onChange={(event) => props.onPageSizeChange(Number(event.target.value) as PageSize)}
          style={{ ...controlStyle, width: 88 }}
        >
          <option value={5}>5</option>
          <option value={10}>10</option>
          <option value={20}>20</option>
        </select>
      </label>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button type="button" onClick={props.onPrev} disabled={props.page <= 1} style={{ ...secondaryButtonStyle, opacity: props.page <= 1 ? 0.5 : 1 }}>
          Prev
        </button>
        <small style={{ color: "#6b7280" }}>
          Page {props.page} / {props.totalPages}
        </small>
        <button
          type="button"
          onClick={props.onNext}
          disabled={props.page >= props.totalPages}
          style={{ ...secondaryButtonStyle, opacity: props.page >= props.totalPages ? 0.5 : 1 }}
        >
          Next
        </button>
      </div>
    </div>
  );
}

export default function PickingWorkspaceView() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [selectedPickingListId, setSelectedPickingListId] = useState<string>("");
  const [selectedShipmentId, setSelectedShipmentId] = useState<string>("");
  const [selectedPickingLines, setSelectedPickingLines] = useState<PickingLine[]>([]);
  const [selectedShipmentLines, setSelectedShipmentLines] = useState<ShipmentLine[]>([]);
  const [selectedPickingList, setSelectedPickingList] = useState<PickingListSummary | null>(null);
  const [selectedShipment, setSelectedShipment] = useState<ShipmentSummary | null>(null);
  const [qtyInputs, setQtyInputs] = useState<Record<string, string>>({});
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [draftPayload, setDraftPayload] = useState<PickingDraftPayload | null>(null);
  const [shipmentStatusFilter, setShipmentStatusFilter] = useState<FilterStatus>("all");
  const [pickingListStatusFilter, setPickingListStatusFilter] = useState<FilterStatus>("all");
  const [shipmentPageSize, setShipmentPageSize] = useState<PageSize>(5);
  const [pickingListPageSize, setPickingListPageSize] = useState<PageSize>(5);
  const [shipmentPage, setShipmentPage] = useState(1);
  const [pickingListPage, setPickingListPage] = useState(1);

  const loadWorkspace = useCallback(async (options?: { keepSelection?: boolean }) => {
    const keepSelection = options?.keepSelection === true;
    if (!keepSelection) {
      setState({ status: "loading" });
    }

    try {
      const [listsResponse, shipmentsResponse, catalogResponse] = await Promise.all([
        fetch("/api/picking-lists?limit=200", { method: "GET", cache: "no-store", credentials: "include" }),
        fetch("/api/shipments?limit=200", { method: "GET", cache: "no-store", credentials: "include" }),
        fetch("/api/catalog/skus?active=1", { method: "GET", cache: "no-store", credentials: "include" }),
      ]);

      const [listsPayload, shipmentsPayload, catalogPayload] = await Promise.all([
        listsResponse.json().catch(() => null),
        shipmentsResponse.json().catch(() => null),
        catalogResponse.json().catch(() => null),
      ]);

      const warnings: string[] = [];

      if (!catalogResponse.ok) {
        warnings.push("Каталог SKU временно недоступен.");
      }

      if (!listsResponse.ok || !shipmentsResponse.ok) {
        setState({
          status: "ready",
          pickingLists: listsResponse.ok ? asPickingLists((listsPayload as { items?: unknown } | null)?.items) : [],
          shipments: shipmentsResponse.ok ? asShipments((shipmentsPayload as { items?: unknown } | null)?.items) : [],
          catalogItems: catalogResponse.ok ? asCatalogItems((catalogPayload as { items?: unknown } | null)?.items) : [],
          error: "Не удалось загрузить picking workspace.",
          warning: warnings.length > 0 ? warnings.join(" ") : null,
          refreshedAt: new Date().toISOString(),
        });
        return;
      }

      const pickingLists = asPickingLists((listsPayload as { items?: unknown } | null)?.items);
      const shipments = asShipments((shipmentsPayload as { items?: unknown } | null)?.items);

      setState({
        status: "ready",
        pickingLists,
        shipments,
        catalogItems: catalogResponse.ok ? asCatalogItems((catalogPayload as { items?: unknown } | null)?.items) : [],
        error: null,
        warning: warnings.length > 0 ? warnings.join(" ") : null,
        refreshedAt: new Date().toISOString(),
      });

      if (keepSelection) {
        const nextSelectedPickingList = selectedPickingListId
          ? pickingLists.find((item) => asRawString(item.picking_list_id) === selectedPickingListId) ?? null
          : null;
        const nextSelectedShipment = selectedShipmentId
          ? shipments.find((item) => asRawString(item.shipment_id) === selectedShipmentId) ?? null
          : null;

        if (!nextSelectedPickingList) {
          setSelectedPickingListId("");
          setSelectedPickingList(null);
          setSelectedPickingLines([]);
          setQtyInputs({});
        } else {
          setSelectedPickingList(nextSelectedPickingList);
        }

        if (!nextSelectedShipment) {
          setSelectedShipmentId("");
          setSelectedShipment(null);
          setSelectedShipmentLines([]);
          setDraftPayload(null);
        } else {
          setSelectedShipment(nextSelectedShipment);
        }
      }
    } catch {
      setState({
        status: "ready",
        pickingLists: [],
        shipments: [],
        catalogItems: [],
        error: "Не удалось загрузить picking workspace.",
        warning: null,
        refreshedAt: new Date().toISOString(),
      });
    }
  }, [selectedPickingListId, selectedShipmentId]);

  const loadPickingListDetail = useCallback(async (pickingListId: string) => {
    setPendingAction(`list:${pickingListId}`);
    try {
      const response = await fetch(`/api/picking-lists/${encodeURIComponent(pickingListId)}`, {
        method: "GET",
        cache: "no-store",
        credentials: "include",
      });
      const payload = (await response.json().catch(() => null)) as
        | { picking_list?: PickingListSummary; lines?: unknown; error?: unknown }
        | null;

      if (!response.ok) {
        setNotice({
          tone: "error",
          text:
            asRawString(payload?.error).toLowerCase().includes("timed out")
              ? "Эта picking list недоступна в локальном режиме. Создайте новую list из draft."
              : asString(payload?.error) || "Не удалось загрузить picking list.",
        });
        return;
      }

      const lines = asPickingLines(payload?.lines);
      setSelectedPickingList(payload?.picking_list ?? null);
      setSelectedPickingLines(lines);
      setQtyInputs(
        Object.fromEntries(lines.map((line) => [asRawString(line.line_id), String(Math.max(0, asInt(line.planned_qty) - asInt(line.picked_qty)))]))
      );
      setSelectedPickingListId(pickingListId);
    } finally {
      setPendingAction(null);
    }
  }, []);

  const loadShipmentDetail = useCallback(async (shipmentId: string) => {
    setPendingAction(`shipment:${shipmentId}`);
    try {
      const response = await fetch(`/api/shipments/${encodeURIComponent(shipmentId)}`, {
        method: "GET",
        cache: "no-store",
        credentials: "include",
      });
      const payload = (await response.json().catch(() => null)) as
        | { shipment?: ShipmentSummary; lines?: unknown; error?: unknown }
        | null;

      if (!response.ok) {
        setNotice({
          tone: "error",
          text:
            asRawString(payload?.error).toLowerCase().includes("timed out")
              ? "Shipment detail недоступен из GAS. Выберите demo shipment после обновления страницы."
              : asString(payload?.error) || "Не удалось загрузить shipment.",
        });
        return;
      }

      setSelectedShipment(payload?.shipment ?? null);
      setSelectedShipmentLines(asShipmentLines(payload?.lines));
      setSelectedShipmentId(shipmentId);
      setDraftPayload(null);
    } finally {
      setPendingAction(null);
    }
  }, []);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const skuNameById = useMemo(
    () =>
      new Map(
        (state.status === "ready" ? state.catalogItems : [])
          .map((item) => [asRawString(item.sku_id), asRawString(item.sku_name)] as const)
          .filter((entry) => entry[0])
      ),
    [state]
  );

  const pickingLists = state.status === "ready" ? state.pickingLists : [];
  const shipments = state.status === "ready" ? state.shipments : [];

  const shipmentStatuses = useMemo(
    () =>
      Array.from(new Set(shipments.map((item) => asRawString(item.status)).filter(Boolean))).sort((left, right) => left.localeCompare(right)),
    [shipments]
  );
  const pickingListStatuses = useMemo(
    () =>
      Array.from(new Set(pickingLists.map((item) => asRawString(item.status)).filter(Boolean))).sort((left, right) => left.localeCompare(right)),
    [pickingLists]
  );

  const shipmentStatusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: shipments.length };
    for (const item of shipments) {
      const status = asRawString(item.status);
      if (!status) continue;
      counts[status] = (counts[status] ?? 0) + 1;
    }
    return counts;
  }, [shipments]);

  const pickingStatusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: pickingLists.length };
    for (const item of pickingLists) {
      const status = asRawString(item.status);
      if (!status) continue;
      counts[status] = (counts[status] ?? 0) + 1;
    }
    return counts;
  }, [pickingLists]);

  const filteredShipments = useMemo(
    () =>
      shipments
        .filter((item) => shipmentStatusFilter === "all" || asRawString(item.status) === shipmentStatusFilter)
        .slice()
        .sort((left, right) => {
          const counterpartyCompare = asRawString(left.counterparty).localeCompare(asRawString(right.counterparty));
          if (counterpartyCompare !== 0) return counterpartyCompare;
          const destinationWarehouseCompare = asRawString(left.destination_warehouse).localeCompare(asRawString(right.destination_warehouse));
          if (destinationWarehouseCompare !== 0) return destinationWarehouseCompare;
          return asRawString(left.deadline_at).localeCompare(asRawString(right.deadline_at)) || asRawString(left.shipment_id).localeCompare(asRawString(right.shipment_id));
        }),
    [shipments, shipmentStatusFilter]
  );

  const filteredPickingLists = useMemo(
    () =>
      pickingLists
        .filter((item) => pickingListStatusFilter === "all" || asRawString(item.status) === pickingListStatusFilter)
        .slice()
        .sort((left, right) => {
          return (
            asRawString(right.created_at).localeCompare(asRawString(left.created_at)) ||
            asRawString(left.counterparty).localeCompare(asRawString(right.counterparty)) ||
            asRawString(left.destination_warehouse).localeCompare(asRawString(right.destination_warehouse))
          );
        }),
    [pickingLists, pickingListStatusFilter]
  );

  useEffect(() => {
    setShipmentPage(1);
  }, [shipmentStatusFilter, shipmentPageSize]);

  useEffect(() => {
    setPickingListPage(1);
  }, [pickingListStatusFilter, pickingListPageSize]);

  const pagedShipments = useMemo(() => paginate(filteredShipments, shipmentPage, shipmentPageSize), [filteredShipments, shipmentPage, shipmentPageSize]);
  const pagedPickingLists = useMemo(
    () => paginate(filteredPickingLists, pickingListPage, pickingListPageSize),
    [filteredPickingLists, pickingListPage, pickingListPageSize]
  );

  const openLists = useMemo(() => pickingLists.filter((item) => isOpenStatus(item.status)).length, [pickingLists]);
  const openLines = useMemo(
    () => selectedPickingLines.filter((line) => isOpenStatus(line.task_status || line.status)).length,
    [selectedPickingLines]
  );

  const selectedShipmentWarehouse = asRawString(selectedShipment?.warehouse_key);
  const actionableDraftLines = useMemo(
    () =>
      asPickingDraftLines(draftPayload?.lines).filter(
        (line) => asRawString(line.state) === "ready" && asRawString(line.location_id) && asInt(line.suggested_qty) > 0
      ),
    [draftPayload]
  );

  const hasDraftForSelectedShipment =
    Boolean(selectedShipmentId) && asRawString(draftPayload?.shipment?.shipment_id) === selectedShipmentId;

  async function buildDraftForShipment() {
    if (!selectedShipmentId) {
      setNotice({ tone: "error", text: "Сначала выберите shipment." });
      return;
    }

    const rebuilding = hasDraftForSelectedShipment;
    setPendingAction("draft");
    setNotice(null);

    try {
      const response = await fetch(`/api/picking/draft?shipment_id=${encodeURIComponent(selectedShipmentId)}`, {
        method: "GET",
        cache: "no-store",
        credentials: "include",
      });
      const payload = (await response.json().catch(() => null)) as PickingDraftPayload | null;

      if (!response.ok || !payload?.ok) {
        setDraftPayload(null);
        setNotice({ tone: "error", text: asString(payload?.error) || "Не удалось собрать picking draft." });
        return;
      }

      setDraftPayload(payload);
      setNotice({
        tone: "success",
        text: rebuilding
          ? `Draft rebuilt for shipment ${asRawString(payload.shipment?.shipment_id) || selectedShipmentId}. Existing picking lists stay unchanged.`
          : `Draft built for shipment ${asRawString(payload.shipment?.shipment_id) || selectedShipmentId}. Existing picking lists stay unchanged.`,
      });
    } finally {
      setPendingAction(null);
    }
  }

  async function createPickingListFromShipment() {
    if (!selectedShipment || !selectedShipmentWarehouse || actionableDraftLines.length === 0) {
      setNotice({ tone: "error", text: "Для создания picking list нужен собранный draft с actionable lines." });
      return;
    }

    setPendingAction("create");
    setNotice(null);

    try {
      const response = await fetch("/api/picking-lists/create", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          [REQUEST_ID_HEADER]: crypto.randomUUID(),
        },
        body: JSON.stringify({
          warehouse_key: selectedShipmentWarehouse,
          shipment_id: asRawString(selectedShipment.shipment_id),
          direction: asRawString(selectedShipment.direction),
          counterparty: asRawString(selectedShipment.counterparty),
          destination: asRawString(selectedShipment.destination),
          destination_warehouse: asRawString(selectedShipment.destination_warehouse),
          planned_date: asRawString(selectedShipment.planned_date),
          deadline_at: asRawString(selectedShipment.deadline_at),
          lines: actionableDraftLines.map((line) => ({
            sku_id: asRawString(line.sku_id),
            location_id: asRawString(line.location_id),
            qty: asInt(line.suggested_qty),
          })),
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; replayed?: unknown; picking_list_id?: unknown; error?: unknown }
        | null;

      if (!response.ok) {
        setNotice({ tone: "error", text: asString(payload?.error) || "Не удалось создать picking list." });
        return;
      }

      const nextPickingListId = asRawString(payload?.picking_list_id);
      await loadWorkspace({ keepSelection: true });
      if (nextPickingListId) {
        await loadPickingListDetail(nextPickingListId);
      }
      setNotice({
        tone: "success",
        text:
          payload?.replayed === true
            ? `Using existing picking list ${nextPickingListId || "—"} for the same draft snapshot.`
            : nextPickingListId
              ? `Picking list ${nextPickingListId} created from shipment ${asRawString(selectedShipment.shipment_id)}.`
              : "Picking list created.",
      });
    } finally {
      setPendingAction(null);
    }
  }

  async function confirmLine(line: PickingLine) {
    const pickingListId = asRawString(selectedPickingList?.picking_list_id);
    const lineId = asRawString(line.line_id);
    const qtyDone = Number(qtyInputs[lineId] ?? "");

    if (!pickingListId || !lineId || !Number.isInteger(qtyDone) || qtyDone < 0) {
      setNotice({ tone: "error", text: "Укажите корректное количество для подтверждения." });
      return;
    }

    setPendingAction(`confirm:${lineId}`);
    setNotice(null);

    try {
      const response = await fetch("/api/picking/confirm", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          [REQUEST_ID_HEADER]: crypto.randomUUID(),
        },
        body: JSON.stringify({
          picking_list_id: pickingListId,
          line_id: lineId,
          qty_done: qtyDone,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;

      if (!response.ok) {
        setNotice({ tone: "error", text: asString(payload?.error) || "Не удалось подтвердить строку." });
        return;
      }

      await Promise.all([loadWorkspace({ keepSelection: true }), loadPickingListDetail(pickingListId)]);
      setNotice({ tone: "success", text: `Строка ${lineId} подтверждена.` });
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <section style={{ display: "grid", gap: 16, padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Picking Workspace</h1>
          <p style={{ margin: "6px 0 0", color: "#4b5563" }}>
            Shipment-driven picking with explicit draft snapshots, shipment context, and execution-safe list handling.
          </p>
        </div>
        <button type="button" onClick={() => void loadWorkspace({ keepSelection: true })} disabled={state.status === "loading"} style={secondaryButtonStyle}>
          {state.status === "loading" ? "Loading..." : "Refresh"}
        </button>
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <Metric label="Open picking lists" value={String(openLists)} note="Статусы кроме done/completed/closed" />
        <Metric label="Selected list open lines" value={String(openLines)} note={selectedPickingListId ? selectedPickingListId : "Выберите list"} />
        <Metric
          label="Shipment candidates"
          value={String(filteredShipments.length)}
          note={shipmentStatusFilter === "all" ? "Все статусы" : `Filter: ${shipmentStatusFilter}`}
        />
        <Metric
          label="Available now"
          value={String(asInt(draftPayload?.summary?.total_suggested_qty))}
          note={draftPayload ? "Current inventory for selected shipment" : "Соберите draft"}
        />
      </div>

      {notice ? (
        <div role="status" style={{ ...toneStyle(notice.tone), borderRadius: 12, padding: "12px 14px" }}>
          {notice.text}
        </div>
      ) : null}

      {state.status === "ready" && state.error ? (
        <div role="alert" style={{ ...toneStyle("error"), borderRadius: 12, padding: "12px 14px" }}>
          {state.error}
        </div>
      ) : null}

      {state.status === "ready" && state.warning ? (
        <div style={{ border: "1px solid #fde68a", background: "#fffbeb", color: "#92400e", borderRadius: 12, padding: "12px 14px" }}>
          {state.warning}
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "minmax(320px, 1.1fr) minmax(320px, 1.1fr) minmax(360px, 1.3fr)" }}>
        <article style={{ ...panelStyle, display: "grid", gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>Shipment candidates</h2>
            <p style={{ margin: "6px 0 0", color: "#6b7280", fontSize: 14 }}>
              Sorted closer to counterparty {"->"} destination warehouse {"->"} shipment, then draft into SKU-level suggestions.
            </p>
          </div>

          <StatusChips statuses={shipmentStatuses} active={shipmentStatusFilter} counts={shipmentStatusCounts} onChange={setShipmentStatusFilter} />

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th align="left" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>context</th>
                  <th align="left" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>status</th>
                  <th align="right" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>qty</th>
                </tr>
              </thead>
              <tbody>
                {pagedShipments.items.length === 0 ? (
                  <tr>
                    <td colSpan={3} style={{ paddingTop: 12, color: "#6b7280" }}>No shipments match the current filter.</td>
                  </tr>
                ) : (
                  pagedShipments.items.map((shipment) => {
                    const shipmentId = asRawString(shipment.shipment_id);
                    const isSelected = shipmentId === selectedShipmentId;
                    const status = asRawString(shipment.status) || "—";
                    const palette = statusChipStyle(status);
                    return (
                      <tr key={shipmentId || Math.random()}>
                        <td style={{ padding: "10px 0", verticalAlign: "top" }}>
                          <button
                            type="button"
                            onClick={() => void loadShipmentDetail(shipmentId)}
                            disabled={!shipmentId || pendingAction === `shipment:${shipmentId}`}
                            style={{
                              border: 0,
                              background: "transparent",
                              color: isSelected ? "#1d4ed8" : "#111827",
                              cursor: "pointer",
                              fontWeight: isSelected ? 700 : 600,
                              padding: 0,
                              textAlign: "left",
                            }}
                          >
                            {asString(shipment.counterparty)}
                          </button>
                          <div style={{ color: "#374151", fontSize: 13, marginTop: 4 }}>{asString(shipment.destination_warehouse || shipment.destination)}</div>
                          <div style={{ color: "#6b7280", fontSize: 12, marginTop: 4 }}>
                            {shipmentId || "—"} • {asString(shipment.direction)} • {formatDate(shipment.planned_date)}
                          </div>
                          <div style={{ color: "#6b7280", fontSize: 12 }}>Deadline: {formatDateTime(shipment.deadline_at)}</div>
                        </td>
                        <td style={{ padding: "10px 0", verticalAlign: "top" }}>
                          <span
                            style={{
                              display: "inline-flex",
                              borderRadius: 999,
                              border: `1px solid ${palette.border}`,
                              background: palette.background,
                              color: palette.color,
                              padding: "6px 10px",
                              fontWeight: 600,
                            }}
                          >
                            {status}
                          </span>
                        </td>
                        <td align="right" style={{ padding: "10px 0", verticalAlign: "top" }}>
                          <div>{asString(shipment.planned_qty)}</div>
                          <div style={{ color: "#6b7280", fontSize: 12 }}>{asString(shipment.planned_lines)} lines</div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {filteredShipments.length > 0 ? (
            <PaginationControls
              label="Rows"
              pageSize={shipmentPageSize}
              onPageSizeChange={setShipmentPageSize}
              page={pagedShipments.safePage}
              totalPages={pagedShipments.totalPages}
              onPrev={() => setShipmentPage((page) => Math.max(1, page - 1))}
              onNext={() => setShipmentPage((page) => Math.min(pagedShipments.totalPages, page + 1))}
            />
          ) : null}
        </article>

        <article style={{ ...panelStyle, display: "grid", gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>Picking lists</h2>
            <p style={{ margin: "6px 0 0", color: "#6b7280", fontSize: 14 }}>
              Existing lists remain immutable execution snapshots even when a later draft is rebuilt.
            </p>
          </div>

          <StatusChips
            statuses={pickingListStatuses}
            active={pickingListStatusFilter}
            counts={pickingStatusCounts}
            onChange={setPickingListStatusFilter}
          />

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th align="left" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>context</th>
                  <th align="left" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>status</th>
                  <th align="right" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>qty</th>
                </tr>
              </thead>
              <tbody>
                {pagedPickingLists.items.length === 0 ? (
                  <tr>
                    <td colSpan={3} style={{ paddingTop: 12, color: "#6b7280" }}>No picking lists match the current filter.</td>
                  </tr>
                ) : (
                  pagedPickingLists.items.map((item) => {
                    const pickingListId = asRawString(item.picking_list_id);
                    const isSelected = pickingListId === selectedPickingListId;
                    const status = asRawString(item.status) || "—";
                    const palette = statusChipStyle(status);
                    return (
                      <tr key={pickingListId || Math.random()}>
                        <td style={{ padding: "10px 0", verticalAlign: "top" }}>
                          <button
                            type="button"
                            onClick={() => void loadPickingListDetail(pickingListId)}
                            disabled={!pickingListId || pendingAction === `list:${pickingListId}`}
                            style={{
                              border: 0,
                              background: "transparent",
                              color: isSelected ? "#1d4ed8" : "#111827",
                              cursor: "pointer",
                              fontWeight: isSelected ? 700 : 600,
                              padding: 0,
                              textAlign: "left",
                            }}
                          >
                            {asString(item.counterparty || item.picking_list_id)}
                          </button>
                          <div style={{ color: "#374151", fontSize: 13, marginTop: 4 }}>{asString(item.destination_warehouse || item.destination)}</div>
                          <div style={{ color: "#6b7280", fontSize: 12, marginTop: 4 }}>
                            {asString(item.picking_list_id)} • shipment {asString(item.shipment_id)} • {formatDateTime(item.created_at)}
                          </div>
                        </td>
                        <td style={{ padding: "10px 0", verticalAlign: "top" }}>
                          <span
                            style={{
                              display: "inline-flex",
                              borderRadius: 999,
                              border: `1px solid ${palette.border}`,
                              background: palette.background,
                              color: palette.color,
                              padding: "6px 10px",
                              fontWeight: 600,
                            }}
                          >
                            {status}
                          </span>
                        </td>
                        <td align="right" style={{ padding: "10px 0", verticalAlign: "top" }}>
                          <div>{asString(item.planned_qty)}</div>
                          <div style={{ color: "#6b7280", fontSize: 12 }}>{asString(item.planned_lines)} lines</div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {filteredPickingLists.length > 0 ? (
            <PaginationControls
              label="Rows"
              pageSize={pickingListPageSize}
              onPageSizeChange={setPickingListPageSize}
              page={pagedPickingLists.safePage}
              totalPages={pagedPickingLists.totalPages}
              onPrev={() => setPickingListPage((page) => Math.max(1, page - 1))}
              onNext={() => setPickingListPage((page) => Math.min(pagedPickingLists.totalPages, page + 1))}
            />
          ) : null}
        </article>

        <article style={{ ...panelStyle, display: "grid", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18 }}>Selected details</h2>
              <p style={{ margin: "6px 0 0", color: "#6b7280", fontSize: 14 }}>
                Rebuild draft recalculates from current inventory. Existing picking lists do not mutate silently.
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => void buildDraftForShipment()}
                disabled={pendingAction === "draft" || !selectedShipment}
                style={secondaryButtonStyle}
              >
                {pendingAction === "draft" ? "Building..." : hasDraftForSelectedShipment ? "Rebuild draft" : "Build draft"}
              </button>
              <button
                type="button"
                onClick={() => void createPickingListFromShipment()}
                disabled={pendingAction === "create" || !selectedShipment || !selectedShipmentWarehouse || actionableDraftLines.length === 0}
                style={buttonStyle}
              >
                {pendingAction === "create" ? "Creating..." : "Create picking list"}
              </button>
            </div>
          </div>

          <div style={{ marginTop: 4, display: "grid", gap: 12 }}>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
              <strong>Shipment</strong>
              <div style={{ marginTop: 8, color: "#374151", fontSize: 14, display: "grid", gap: 4 }}>
                <div>Context: {shipmentContextLabel(selectedShipment)}</div>
                <div>ID: {asString(selectedShipment?.shipment_id)}</div>
                <div>Status: {asString(selectedShipment?.status)}</div>
                <div>Direction: {asString(selectedShipment?.direction)}</div>
                <div>Destination: {asString(selectedShipment?.destination)}</div>
                <div>Planned date: {formatDate(selectedShipment?.planned_date)}</div>
                <div>Deadline: {formatDateTime(selectedShipment?.deadline_at)}</div>
                <div>Source warehouse: {asString(selectedShipment?.warehouse_key)}</div>
              </div>
              <div style={{ marginTop: 10, overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th align="left" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>sku</th>
                      <th align="right" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>planned</th>
                      <th align="right" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>picked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedShipmentLines.length === 0 ? (
                      <tr>
                        <td colSpan={3} style={{ paddingTop: 10, color: "#6b7280" }}>Select a shipment to inspect SKU demand.</td>
                      </tr>
                    ) : (
                      selectedShipmentLines.map((line) => {
                        const skuId = asRawString(line.sku_id);
                        return (
                          <tr key={asRawString(line.line_id) || skuId}>
                            <td style={{ padding: "10px 0" }}>
                              <div>{skuNameById.get(skuId) || skuId || "—"}</div>
                              <div style={{ color: "#6b7280", fontSize: 12 }}>{skuId || "—"}</div>
                            </td>
                            <td align="right" style={{ padding: "10px 0" }}>{asString(line.planned_qty)}</td>
                            <td align="right" style={{ padding: "10px 0" }}>{asString(line.picked_qty)}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
              <strong>Draft suggestions</strong>
              <div style={{ marginTop: 8, color: "#374151", fontSize: 14, display: "grid", gap: 4 }}>
                <div>Actionable lines: {asString(draftPayload?.summary?.actionable_line_count)}</div>
                <div>Available now: {asString(draftPayload?.summary?.total_suggested_qty)}</div>
                <div>Requires production: {asString(draftPayload?.summary?.total_short_qty)}</div>
                <div>Shortage lines: {asString(draftPayload?.summary?.shortage_line_count)}</div>
              </div>
              <div style={{ marginTop: 10, overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th align="left" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>sku</th>
                      <th align="left" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>location</th>
                      <th align="right" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>outstanding</th>
                      <th align="right" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>available now</th>
                      <th align="right" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>requires production</th>
                    </tr>
                  </thead>
                  <tbody>
                    {asPickingDraftLines(draftPayload?.lines).length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ paddingTop: 10, color: "#6b7280" }}>
                          Build or rebuild a draft to inspect the current inventory snapshot.
                        </td>
                      </tr>
                    ) : (
                      asPickingDraftLines(draftPayload?.lines).map((line) => {
                        const skuId = asRawString(line.sku_id);
                        const rowTone =
                          asInt(line.short_qty) > 0
                            ? { background: "#fff7ed" }
                            : asInt(line.suggested_qty) > 0
                              ? { background: "#f8fafc" }
                              : null;
                        return (
                          <tr key={asRawString(line.draft_line_id) || skuId} style={rowTone ?? undefined}>
                            <td style={{ padding: "10px 0" }}>
                              <div>{skuNameById.get(skuId) || skuId || "—"}</div>
                              <div style={{ color: "#6b7280", fontSize: 12 }}>{skuId || "—"}</div>
                            </td>
                            <td style={{ padding: "10px 0" }}>{asString(line.location_id)}</td>
                            <td align="right" style={{ padding: "10px 0" }}>{asString(line.outstanding_qty)}</td>
                            <td align="right" style={{ padding: "10px 0" }}>{asString(line.suggested_qty)}</td>
                            <td align="right" style={{ padding: "10px 0" }}>{asString(line.short_qty)}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
              <strong>Picking list</strong>
              <div style={{ marginTop: 8, color: "#374151", fontSize: 14, display: "grid", gap: 4 }}>
                <div>Context: {pickingContextLabel(selectedPickingList)}</div>
                <div>ID: {asString(selectedPickingList?.picking_list_id)}</div>
                <div>Shipment: {asString(selectedPickingList?.shipment_id)}</div>
                <div>Status: {asString(selectedPickingList?.status)}</div>
                <div>Planned date: {formatDate(selectedPickingList?.planned_date)}</div>
                <div>Deadline: {formatDateTime(selectedPickingList?.deadline_at)}</div>
                <div>Warehouse: {asString(selectedPickingList?.warehouse_key)}</div>
              </div>
              <div style={{ marginTop: 10, overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th align="left" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>sku</th>
                      <th align="right" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>planned</th>
                      <th align="right" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>picked</th>
                      <th align="left" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>task</th>
                      <th align="left" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>confirm</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedPickingLines.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ paddingTop: 10, color: "#6b7280" }}>Select a picking list to inspect lines.</td>
                      </tr>
                    ) : (
                      selectedPickingLines.map((line) => {
                        const lineId = asRawString(line.line_id);
                        const skuId = asRawString(line.sku_id);
                        const pending = pendingAction === `confirm:${lineId}`;
                        return (
                          <tr key={lineId || skuId}>
                            <td style={{ padding: "10px 0" }}>
                              <div>{skuNameById.get(skuId) || skuId || "—"}</div>
                              <div style={{ color: "#6b7280", fontSize: 12 }}>{skuId || "—"}</div>
                            </td>
                            <td align="right" style={{ padding: "10px 0" }}>{asString(line.planned_qty)}</td>
                            <td align="right" style={{ padding: "10px 0" }}>{asString(line.picked_qty)}</td>
                            <td style={{ padding: "10px 0" }}>{asString(line.task_status || line.status)}</td>
                            <td style={{ padding: "10px 0" }}>
                              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                <input
                                  type="number"
                                  min={0}
                                  value={qtyInputs[lineId] ?? ""}
                                  onChange={(event) =>
                                    setQtyInputs((current) => ({
                                      ...current,
                                      [lineId]: event.target.value,
                                    }))
                                  }
                                  style={{ ...inputStyle, width: 84 }}
                                />
                                <button type="button" onClick={() => void confirmLine(line)} disabled={pending} style={secondaryButtonStyle}>
                                  {pending ? "Saving..." : "Confirm"}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </article>
      </div>

      <div style={{ color: "#6b7280", fontSize: 13 }}>
        Last refreshed: {state.status === "ready" ? formatDateTime(state.refreshedAt) : "—"}
      </div>
    </section>
  );
}

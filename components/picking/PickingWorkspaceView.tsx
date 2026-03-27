"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { formatDateTime } from "@/lib/ui/formatDateTime";

type PickingListSummary = {
  picking_list_id?: unknown;
  created_at?: unknown;
  status?: unknown;
  warehouse_key?: unknown;
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

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <article style={{ ...panelStyle, padding: 14 }}>
      <div style={{ color: "#6b7280", fontSize: 12, marginBottom: 8 }}>{label}</div>
      <strong style={{ display: "block", fontSize: 28, lineHeight: 1.1 }}>{value}</strong>
      {note ? <small style={{ color: "#6b7280" }}>{note}</small> : null}
    </article>
  );
}

function toneStyle(tone: Notice["tone"]) {
  if (tone === "success") {
    return { background: "#ecfdf5", color: "#166534", border: "1px solid #86efac" } as const;
  }

  return { background: "#fef2f2", color: "#991b1b", border: "1px solid #fca5a5" } as const;
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

  const loadWorkspace = useCallback(async (options?: { keepSelection?: boolean }) => {
    const keepSelection = options?.keepSelection === true;
    if (!keepSelection) {
      setState({ status: "loading" });
    }

    try {
      const [listsResponse, shipmentsResponse, catalogResponse] = await Promise.all([
        fetch("/api/picking-lists?limit=50", { method: "GET", cache: "no-store", credentials: "include" }),
        fetch("/api/shipments?limit=50", { method: "GET", cache: "no-store", credentials: "include" }),
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
        const stillSelectedPickingList = selectedPickingListId
          ? pickingLists.find((item) => asRawString(item.picking_list_id) === selectedPickingListId)
          : null;
        if (!stillSelectedPickingList) {
          setSelectedPickingListId("");
          setSelectedPickingList(null);
          setSelectedPickingLines([]);
          setQtyInputs({});
        }

        const stillSelectedShipment = selectedShipmentId
          ? shipments.find((item) => asRawString(item.shipment_id) === selectedShipmentId)
          : null;
        if (!stillSelectedShipment) {
          setSelectedShipmentId("");
          setSelectedShipment(null);
          setSelectedShipmentLines([]);
          setDraftPayload(null);
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

  const openLists = useMemo(
    () =>
      pickingLists.filter((item) => {
        const status = asRawString(item.status).toLowerCase();
        return status !== "done" && status !== "completed" && status !== "closed";
      }).length,
    [pickingLists]
  );

  const openLines = useMemo(
    () =>
      selectedPickingLines.filter((line) => {
        const status = asRawString(line.task_status || line.status).toLowerCase();
        return status !== "done" && status !== "completed" && status !== "closed";
      }).length,
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

  async function buildDraftForShipment() {
    if (!selectedShipmentId) {
      setNotice({ tone: "error", text: "Сначала выберите shipment." });
      return;
    }

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
        text: `Draft собран для shipment ${asRawString(payload.shipment?.shipment_id) || selectedShipmentId}.`,
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
          lines: actionableDraftLines.map((line) => ({
            sku_id: asRawString(line.sku_id),
            location_id: asRawString(line.location_id),
            qty: asInt(line.suggested_qty),
          })),
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; picking_list_id?: unknown; error?: unknown }
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
        text: nextPickingListId
          ? `Picking list ${nextPickingListId} создан из shipment ${asRawString(selectedShipment.shipment_id)}.`
          : "Picking list создан.",
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
            Operator-facing execution surface for shipment candidates, picking lists, and line confirmation.
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
          value={String(shipments.length)}
          note={selectedShipmentId ? `selected ${selectedShipmentId}` : "Для draft source"}
        />
        <Metric
          label="Draft suggested qty"
          value={String(asInt(draftPayload?.summary?.total_suggested_qty))}
          note={draftPayload ? "Shipment + inventory state" : "Соберите draft"}
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

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "minmax(280px, 1fr) minmax(280px, 1fr) minmax(320px, 1.2fr)" }}>
        <article style={panelStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18 }}>Shipment candidates</h2>
              <p style={{ margin: "6px 0 0", color: "#6b7280", fontSize: 14 }}>Cross-check current shipment demand before list creation.</p>
            </div>
          </div>
          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th align="left" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>shipment</th>
                  <th align="left" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>status</th>
                  <th align="right" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>qty</th>
                </tr>
              </thead>
              <tbody>
                {shipments.length === 0 ? (
                  <tr>
                    <td colSpan={3} style={{ paddingTop: 12, color: "#6b7280" }}>No shipments available.</td>
                  </tr>
                ) : (
                  shipments.map((shipment) => {
                    const shipmentId = asRawString(shipment.shipment_id);
                    const isSelected = shipmentId === selectedShipmentId;
                    return (
                      <tr key={shipmentId || Math.random()}>
                        <td style={{ padding: "10px 0" }}>
                          <button
                            type="button"
                            onClick={() => void loadShipmentDetail(shipmentId)}
                            disabled={!shipmentId || pendingAction === `shipment:${shipmentId}`}
                            style={{
                              border: 0,
                              background: "transparent",
                              color: isSelected ? "#1d4ed8" : "#111827",
                              cursor: "pointer",
                              fontWeight: isSelected ? 700 : 500,
                              padding: 0,
                            }}
                          >
                            {shipmentId || "—"}
                          </button>
                          <div style={{ color: "#6b7280", fontSize: 12 }}>{asString(shipment.warehouse_key)}</div>
                        </td>
                        <td style={{ padding: "10px 0" }}>{asString(shipment.status)}</td>
                        <td align="right" style={{ padding: "10px 0" }}>{asString(shipment.planned_qty)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article style={panelStyle}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>Picking lists</h2>
            <p style={{ margin: "6px 0 0", color: "#6b7280", fontSize: 14 }}>Deterministic current execution state from picking_lists.</p>
          </div>
          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th align="left" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>list</th>
                  <th align="left" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>status</th>
                  <th align="right" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>qty</th>
                </tr>
              </thead>
              <tbody>
                {pickingLists.length === 0 ? (
                  <tr>
                    <td colSpan={3} style={{ paddingTop: 12, color: "#6b7280" }}>No picking lists available.</td>
                  </tr>
                ) : (
                  pickingLists.map((item) => {
                    const pickingListId = asRawString(item.picking_list_id);
                    const isSelected = pickingListId === selectedPickingListId;
                    return (
                      <tr key={pickingListId || Math.random()}>
                        <td style={{ padding: "10px 0" }}>
                          <button
                            type="button"
                            onClick={() => void loadPickingListDetail(pickingListId)}
                            disabled={!pickingListId || pendingAction === `list:${pickingListId}`}
                            style={{
                              border: 0,
                              background: "transparent",
                              color: isSelected ? "#1d4ed8" : "#111827",
                              cursor: "pointer",
                              fontWeight: isSelected ? 700 : 500,
                              padding: 0,
                            }}
                          >
                            {pickingListId || "—"}
                          </button>
                          <div style={{ color: "#6b7280", fontSize: 12 }}>{formatDateTime(item.created_at)}</div>
                        </td>
                        <td style={{ padding: "10px 0" }}>{asString(item.status)}</td>
                        <td align="right" style={{ padding: "10px 0" }}>{asString(item.planned_qty)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article style={panelStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18 }}>Selected details</h2>
              <p style={{ margin: "6px 0 0", color: "#6b7280", fontSize: 14 }}>Build backend draft from shipment + inventory, then create list and confirm lines.</p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => void buildDraftForShipment()}
                disabled={pendingAction === "draft" || !selectedShipment}
                style={secondaryButtonStyle}
              >
                {pendingAction === "draft" ? "Building..." : "Build draft"}
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

          <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
              <strong>Shipment</strong>
              <div style={{ marginTop: 8, color: "#374151", fontSize: 14 }}>
                <div>ID: {asString(selectedShipment?.shipment_id)}</div>
                <div>Warehouse: {asString(selectedShipment?.warehouse_key)}</div>
                <div>Status: {asString(selectedShipment?.status)}</div>
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
                        <td colSpan={3} style={{ paddingTop: 10, color: "#6b7280" }}>Select a shipment to inspect lines.</td>
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
              <div style={{ marginTop: 8, color: "#374151", fontSize: 14 }}>
                <div>Actionable lines: {asString(draftPayload?.summary?.actionable_line_count)}</div>
                <div>Shortage lines: {asString(draftPayload?.summary?.shortage_line_count)}</div>
                <div>Suggested qty: {asString(draftPayload?.summary?.total_suggested_qty)}</div>
              </div>
              <div style={{ marginTop: 10, overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th align="left" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>sku</th>
                      <th align="left" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>location</th>
                      <th align="right" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>outstanding</th>
                      <th align="right" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>suggested</th>
                      <th align="right" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>short</th>
                    </tr>
                  </thead>
                  <tbody>
                    {asPickingDraftLines(draftPayload?.lines).length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ paddingTop: 10, color: "#6b7280" }}>Build draft to inspect suggested picking lines.</td>
                      </tr>
                    ) : (
                      asPickingDraftLines(draftPayload?.lines).map((line) => {
                        const skuId = asRawString(line.sku_id);
                        return (
                          <tr key={asRawString(line.draft_line_id) || skuId}>
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
              <div style={{ marginTop: 8, color: "#374151", fontSize: 14 }}>
                <div>ID: {asString(selectedPickingList?.picking_list_id)}</div>
                <div>Warehouse: {asString(selectedPickingList?.warehouse_key)}</div>
                <div>Status: {asString(selectedPickingList?.status)}</div>
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
    </section>
  );
}

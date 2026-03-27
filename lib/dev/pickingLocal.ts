import { promises as fs } from "fs";

import { DEMO_PRODUCTION_PLAN } from "@/lib/dev/productionLaunchLocal";

const LOCAL_PICKING_STORE = "/tmp/mvp1_picking_state.json";

type LocalShipmentSummary = {
  shipment_id: string;
  created_at: string | null;
  status: string | null;
  warehouse_key: string | null;
  planned_lines: number | null;
  planned_qty: number | null;
};

type LocalShipmentLine = {
  line_id: string;
  sku_id: string;
  planned_qty: number;
  picked_qty: number | null;
  status: string | null;
};

type LocalPickingListSummary = {
  picking_list_id: string;
  created_at: string | null;
  status: string | null;
  warehouse_key: string | null;
  planned_lines: number | null;
  planned_qty: number | null;
};

type LocalPickingLine = {
  line_id: string;
  sku_id: string;
  planned_qty: number;
  picked_qty: number | null;
  status: string | null;
  task_status: string | null;
  location_id: string | null;
};

type LocalPickingStore = {
  lists: Array<LocalPickingListSummary & { lines: LocalPickingLine[] }>;
};

type CatalogItem = {
  sku_id: string;
  sku_name: string;
  sku_type: "single";
  sub_category: string | null;
  active: 0 | 1;
  photo_url: string | null;
};

type BalanceItem = {
  sku_id: string;
  location_id: string;
  available_qty: number;
  updated_at: string;
};

type DraftLine = {
  draft_line_id: string;
  shipment_line_id: string;
  sku_id: string;
  planned_qty: number;
  picked_qty: number;
  outstanding_qty: number;
  location_id: string | null;
  available_qty: number;
  suggested_qty: number;
  short_qty: number;
  state: "ready" | "short";
  updated_at: string | null;
};

const DEMO_CREATED_AT = "2026-03-26T16:25:00.000Z";
const DEMO_WAREHOUSE = "MAIN";

const DEMO_INVENTORY: BalanceItem[] = [
  { sku_id: "OM-BM-Red(Dark)", location_id: "A-01", available_qty: 30, updated_at: DEMO_CREATED_AT },
  { sku_id: "OM-BM-Red(Dark)", location_id: "A-02", available_qty: 20, updated_at: DEMO_CREATED_AT },
  { sku_id: "OM-BM-Brown(Dark)", location_id: "B-01", available_qty: 3, updated_at: DEMO_CREATED_AT },
  { sku_id: "OM-BM-Brown(Mix)", location_id: "C-01", available_qty: 10, updated_at: DEMO_CREATED_AT },
  { sku_id: "OM-BM-Mono(White)", location_id: "D-01", available_qty: 20, updated_at: DEMO_CREATED_AT },
];

function isDevRuntime(): boolean {
  return process.env.NODE_ENV !== "production";
}

function shipmentIds(): string[] {
  return Array.from(
    new Set(
      DEMO_PRODUCTION_PLAN.items.flatMap((item) =>
        Array.isArray(item.shipment_ids) ? item.shipment_ids.filter((value): value is string => typeof value === "string") : []
      )
    )
  );
}

function shipmentLinesById(): Map<string, LocalShipmentLine[]> {
  const lines = new Map<string, LocalShipmentLine[]>();
  for (const item of DEMO_PRODUCTION_PLAN.items) {
    const ids = Array.isArray(item.shipment_ids) ? item.shipment_ids.filter((value): value is string => typeof value === "string") : [];
    for (const shipmentId of ids) {
      const current = lines.get(shipmentId) ?? [];
      current.push({
        line_id: `${shipmentId}:${item.sku_id}`,
        sku_id: item.sku_id,
        planned_qty: item.demand_qty,
        picked_qty: 0,
        status: "new",
      });
      lines.set(shipmentId, current);
    }
  }
  return lines;
}

function demoShipments(): LocalShipmentSummary[] {
  const linesMap = shipmentLinesById();
  return shipmentIds().map((shipmentId) => {
    const lines = linesMap.get(shipmentId) ?? [];
    return {
      shipment_id: shipmentId,
      created_at: DEMO_CREATED_AT,
      status: "planned",
      warehouse_key: DEMO_WAREHOUSE,
      planned_lines: lines.length,
      planned_qty: lines.reduce((sum, line) => sum + line.planned_qty, 0),
    };
  });
}

function demoCatalog(): CatalogItem[] {
  return DEMO_PRODUCTION_PLAN.items.map((item) => ({
    sku_id: item.sku_id,
    sku_name: item.sku_name ?? item.sku_id,
    sku_type: "single",
    sub_category: null,
    active: 1,
    photo_url: item.photo_url ?? null,
  }));
}

function defaultStore(): LocalPickingStore {
  return { lists: [] };
}

async function readStore(): Promise<LocalPickingStore> {
  try {
    const raw = await fs.readFile(LOCAL_PICKING_STORE, "utf8");
    const parsed = JSON.parse(raw) as LocalPickingStore;
    return {
      lists: Array.isArray(parsed.lists) ? parsed.lists : [],
    };
  } catch {
    return defaultStore();
  }
}

async function writeStore(store: LocalPickingStore): Promise<void> {
  await fs.writeFile(LOCAL_PICKING_STORE, JSON.stringify(store, null, 2), "utf8");
}

export function shouldUseLocalPickingFallback(): boolean {
  return isDevRuntime();
}

export function listLocalShipments(limit: number): LocalShipmentSummary[] {
  return demoShipments().slice(0, limit);
}

export function getLocalShipment(shipmentId: string): { shipment: LocalShipmentSummary; lines: LocalShipmentLine[] } | null {
  const shipment = demoShipments().find((item) => item.shipment_id === shipmentId);
  if (!shipment) return null;
  return {
    shipment,
    lines: shipmentLinesById().get(shipmentId) ?? [],
  };
}

export function listLocalCatalog(active: 0 | 1): CatalogItem[] {
  return active === 0 ? [] : demoCatalog();
}

export async function listLocalPickingLists(limit: number): Promise<LocalPickingListSummary[]> {
  const store = await readStore();
  return store.lists
    .slice()
    .sort((left, right) => (right.created_at ?? "").localeCompare(left.created_at ?? ""))
    .slice(0, limit)
    .map(({ lines, ...list }) => list);
}

export async function getLocalPickingList(
  pickingListId: string
): Promise<{ picking_list: LocalPickingListSummary; lines: LocalPickingLine[] } | null> {
  const store = await readStore();
  const found = store.lists.find((item) => item.picking_list_id === pickingListId);
  if (!found) return null;
  const { lines, ...picking_list } = found;
  return { picking_list, lines };
}

export async function createLocalPickingList(input: {
  warehouse_key: string;
  lines: Array<{ sku_id: string; location_id: string; qty: number }>;
}): Promise<{ picking_list_id: string; replayed?: boolean }> {
  const store = await readStore();
  const signature = JSON.stringify(
    input.lines.map((line) => ({ sku_id: line.sku_id, location_id: line.location_id, qty: line.qty })).sort((a, b) => {
      const left = `${a.sku_id}:${a.location_id}:${a.qty}`;
      const right = `${b.sku_id}:${b.location_id}:${b.qty}`;
      return left.localeCompare(right);
    })
  );

  const existing = store.lists.find((item) => {
    const currentSignature = JSON.stringify(
      item.lines.map((line) => ({ sku_id: line.sku_id, location_id: line.location_id ?? "", qty: line.planned_qty })).sort((a, b) => {
        const left = `${a.sku_id}:${a.location_id}:${a.qty}`;
        const right = `${b.sku_id}:${b.location_id}:${b.qty}`;
        return left.localeCompare(right);
      })
    );
    return item.warehouse_key === input.warehouse_key && currentSignature === signature;
  });

  if (existing) {
    return { picking_list_id: existing.picking_list_id, replayed: true };
  }

  const now = new Date().toISOString();
  const pickingListId = `PKL-LOCAL-${Date.now()}`;
  const nextList = {
    picking_list_id: pickingListId,
    created_at: now,
    status: "new",
    warehouse_key: input.warehouse_key,
    planned_lines: input.lines.length,
    planned_qty: input.lines.reduce((sum, line) => sum + line.qty, 0),
    lines: input.lines.map((line, index) => ({
      line_id: `${pickingListId}:L${index + 1}`,
      sku_id: line.sku_id,
      planned_qty: line.qty,
      picked_qty: 0,
      status: "new",
      task_status: "new",
      location_id: line.location_id,
    })),
  };

  store.lists.unshift(nextList);
  await writeStore(store);
  return { picking_list_id: pickingListId };
}

export async function confirmLocalPickingLine(input: {
  picking_list_id: string;
  line_id: string;
  qty_done: number;
}): Promise<{
  picking_list_id: string;
  line_id: string;
  sku_id: string;
  planned_qty: number;
  picked_qty: number;
  task_status: string;
  short_reason: string | null;
}> {
  const store = await readStore();
  const listIndex = store.lists.findIndex((item) => item.picking_list_id === input.picking_list_id);
  if (listIndex < 0) {
    throw new Error("NOT_FOUND");
  }

  const list = store.lists[listIndex];
  const lineIndex = list.lines.findIndex((line) => line.line_id === input.line_id);
  if (lineIndex < 0) {
    throw new Error("NOT_FOUND");
  }

  const line = list.lines[lineIndex];
  const nextPickedQty = Math.max(0, Math.min(line.planned_qty, input.qty_done));
  const nextTaskStatus = nextPickedQty >= line.planned_qty ? "done" : nextPickedQty > 0 ? "in_progress" : "new";

  list.lines[lineIndex] = {
    ...line,
    picked_qty: nextPickedQty,
    task_status: nextTaskStatus,
    status: nextTaskStatus,
  };

  list.status = list.lines.every((item) => (item.picked_qty ?? 0) >= item.planned_qty) ? "done" : "in_progress";
  store.lists[listIndex] = list;
  await writeStore(store);

  return {
    picking_list_id: list.picking_list_id,
    line_id: input.line_id,
    sku_id: line.sku_id,
    planned_qty: line.planned_qty,
    picked_qty: nextPickedQty,
    task_status: nextTaskStatus,
    short_reason: nextPickedQty < line.planned_qty ? "partial_local_fallback" : null,
  };
}

export function getLocalPickingDraft(shipmentId: string):
  | {
      shipment: LocalShipmentSummary;
      summary: {
        shipment_line_count: number;
        actionable_line_count: number;
        shortage_line_count: number;
        total_outstanding_qty: number;
        total_suggested_qty: number;
        total_short_qty: number;
      };
      lines: DraftLine[];
    }
  | null {
  const shipmentData = getLocalShipment(shipmentId);
  if (!shipmentData) return null;

  const draftLines: DraftLine[] = [];

  for (const shipmentLine of shipmentData.lines) {
    const pickedQty = shipmentLine.picked_qty ?? 0;
    const outstandingQty = Math.max(0, shipmentLine.planned_qty - pickedQty);
    if (outstandingQty <= 0) continue;

    const balances = DEMO_INVENTORY
      .filter((item) => item.sku_id === shipmentLine.sku_id && item.available_qty > 0)
      .sort((left, right) => right.available_qty - left.available_qty);

    let remaining = outstandingQty;
    for (const balance of balances) {
      if (remaining <= 0) break;
      const suggestedQty = Math.min(remaining, balance.available_qty);
      remaining -= suggestedQty;
      draftLines.push({
        draft_line_id: `${shipmentLine.line_id}:${balance.location_id}`,
        shipment_line_id: shipmentLine.line_id,
        sku_id: shipmentLine.sku_id,
        planned_qty: shipmentLine.planned_qty,
        picked_qty: pickedQty,
        outstanding_qty: outstandingQty,
        location_id: balance.location_id,
        available_qty: balance.available_qty,
        suggested_qty: suggestedQty,
        short_qty: 0,
        state: "ready",
        updated_at: balance.updated_at,
      });
    }

    if (remaining > 0) {
      draftLines.push({
        draft_line_id: `${shipmentLine.line_id}:short`,
        shipment_line_id: shipmentLine.line_id,
        sku_id: shipmentLine.sku_id,
        planned_qty: shipmentLine.planned_qty,
        picked_qty: pickedQty,
        outstanding_qty: outstandingQty,
        location_id: null,
        available_qty: 0,
        suggested_qty: 0,
        short_qty: remaining,
        state: "short",
        updated_at: null,
      });
    }
  }

  return {
    shipment: shipmentData.shipment,
    summary: {
      shipment_line_count: shipmentData.lines.length,
      actionable_line_count: draftLines.filter((line) => line.state === "ready" && line.suggested_qty > 0).length,
      shortage_line_count: draftLines.filter((line) => line.short_qty > 0).length,
      total_outstanding_qty: shipmentData.lines.reduce(
        (sum, line) => sum + Math.max(0, line.planned_qty - (line.picked_qty ?? 0)),
        0
      ),
      total_suggested_qty: draftLines.reduce((sum, line) => sum + line.suggested_qty, 0),
      total_short_qty: draftLines.reduce((sum, line) => sum + line.short_qty, 0),
    },
    lines: draftLines,
  };
}

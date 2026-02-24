import { parseErrorPayload } from "@/lib/api/gasError";
import { callGas } from "@/lib/integrations/gasClient";

type PickingListRow = Record<string, unknown>;
type PickingLineRow = Record<string, unknown>;

type ReadError = {
  ok: false;
  error: string;
  code: string;
  details?: Record<string, unknown>;
};

function toError(raw: unknown, fallback: string): ReadError {
  const parsed = parseErrorPayload(raw);
  return {
    ok: false,
    error: parsed.error || fallback,
    code: parsed.code,
    ...(parsed.details ? { details: parsed.details } : {}),
  };
}

function str(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export type PickingListSummary = {
  picking_list_id: string;
  created_at: string | null;
  status: string | null;
  warehouse_key: string | null;
  planned_lines: number | null;
  planned_qty: number | null;
};

export type PickingLine = {
  line_id: string;
  sku_id: string;
  planned_qty: number;
  picked_qty: number | null;
  status: string | null;
};

function normalizePickingList(row: PickingListRow): PickingListSummary | null {
  const pickingListId = str(row.picking_list_id);
  if (!pickingListId) return null;

  return {
    picking_list_id: pickingListId,
    created_at: str(row.created_at),
    status: str(row.status),
    warehouse_key: str(row.warehouse_key),
    planned_lines: num(row.planned_lines),
    planned_qty: num(row.planned_qty),
  };
}

function normalizePickingLine(row: PickingLineRow): PickingLine | null {
  const lineId = str(row.line_id ?? row.picking_line_id);
  const skuId = str(row.sku_id);
  const plannedQty = num(row.planned_qty ?? row.qty_required);

  if (!lineId || !skuId || plannedQty === null) return null;

  return {
    line_id: lineId,
    sku_id: skuId,
    planned_qty: plannedQty,
    picked_qty: num(row.picked_qty ?? row.qty_picked),
    status: str(row.status),
  };
}

type GasPickingListsListResponse = {
  items?: unknown[];
};

export async function readPickingLists(
  requestId: string,
  limit: number
): Promise<{ ok: true; items: PickingListSummary[] } | ReadError> {
  const response = await callGas<GasPickingListsListResponse>("picking.lists.list", { limit }, requestId);

  if (!response.ok || !response.data) {
    return toError(response.error, "Failed to read picking_lists");
  }

  const rows = Array.isArray(response.data.items) ? response.data.items : [];

  return {
    ok: true,
    items: rows
      .filter((row): row is PickingListRow => typeof row === "object" && row !== null)
      .map((row) => normalizePickingList(row))
      .filter((item): item is PickingListSummary => Boolean(item)),
  };
}

type GasPickingListsGetResponse = {
  picking_list?: unknown;
  lines?: unknown[];
};

export async function readPickingListById(
  requestId: string,
  pickingListId: string
): Promise<{ ok: true; picking_list: PickingListSummary; lines: PickingLine[] } | ReadError> {
  const response = await callGas<GasPickingListsGetResponse>(
    "picking.lists.get",
    { picking_list_id: pickingListId },
    requestId
  );

  if (!response.ok || !response.data) {
    return toError(response.error, "Failed to read picking list");
  }

  const pickingList =
    typeof response.data.picking_list === "object" && response.data.picking_list !== null
      ? normalizePickingList(response.data.picking_list as PickingListRow)
      : null;

  if (!pickingList) {
    return {
      ok: false,
      code: "NOT_FOUND",
      error: "Picking list not found",
    };
  }

  const linesRaw = Array.isArray(response.data.lines) ? response.data.lines : [];

  return {
    ok: true,
    picking_list: pickingList,
    lines: linesRaw
      .filter((line): line is PickingLineRow => typeof line === "object" && line !== null)
      .map((line) => normalizePickingLine(line))
      .filter((line): line is PickingLine => Boolean(line)),
  };
}

import { parseErrorPayload } from "@/lib/api/gasError";
import { callGas } from "@/lib/integrations/gasClient";

type PickingListRow = Record<string, unknown>;
type PickingLineRow = Record<string, unknown>;

type GasReadResponse = {
  items?: unknown[];
  rows?: unknown[];
};

type ReadError = {
  ok: false;
  error: string;
  code: string;
  details?: Record<string, unknown>;
};

type ReadOk = {
  ok: true;
  rows: Record<string, unknown>[];
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

async function readRows(
  requestId: string,
  action: string,
  fallback: string
): Promise<ReadOk | ReadError> {
  const response = await callGas<GasReadResponse>(action, {}, requestId);
  if (!response.ok || !response.data) {
    return toError(response.error, fallback);
  }

  const source = Array.isArray(response.data.items)
    ? response.data.items
    : Array.isArray(response.data.rows)
      ? response.data.rows
      : [];

  const rows = source.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null);

  return { ok: true, rows };
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
  const lineId = str(row.line_id);
  const skuId = str(row.sku_id);
  const plannedQty = num(row.planned_qty);

  if (!lineId || !skuId || plannedQty === null) return null;

  return {
    line_id: lineId,
    sku_id: skuId,
    planned_qty: plannedQty,
    picked_qty: num(row.picked_qty),
    status: str(row.status),
  };
}

export async function readPickingLists(requestId: string): Promise<{ ok: true; items: PickingListSummary[] } | ReadError> {
  const read = await readRows(requestId, "picking_lists.read", "Failed to read picking_lists");
  if (read.ok === false) return read;

  return {
    ok: true,
    items: read.rows
      .map((row) => normalizePickingList(row))
      .filter((item): item is PickingListSummary => Boolean(item)),
  };
}

export async function readPickingLines(requestId: string): Promise<{ ok: true; items: (PickingLine & { picking_list_id: string })[] } | ReadError> {
  const read = await readRows(requestId, "picking_lines.read", "Failed to read picking_lines");
  if (read.ok === false) return read;

  const items: (PickingLine & { picking_list_id: string })[] = [];

  for (const row of read.rows) {
    const pickingListId = str(row.picking_list_id);
    const line = normalizePickingLine(row);
    if (!pickingListId || !line) continue;

    items.push({
      ...line,
      picking_list_id: pickingListId,
    });
  }

  return { ok: true, items };
}

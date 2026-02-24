import { callGas } from "@/lib/integrations/gasClient";
import { parseErrorPayload, type ParsedGasError } from "@/lib/api/gasError";

const OPS_DB = "OPS_DB";
const SHIPMENTS_SHEET = "shipments";
const SHIPMENT_LINES_SHEET = "shipment_lines";

const SHEET_READ_ACTIONS = [
  "ops_db.sheet.read",
  "ops_db.read_sheet",
  "control_model.sheet.read",
  "control_model.table.read",
  "sheet.read",
] as const;

type ShipmentListItem = {
  shipment_id: string;
  created_at: string | null;
  status: string | null;
  warehouse_key: string | null;
  planned_lines: number | null;
  planned_qty: number | null;
};

type ShipmentLineItem = {
  line_id: string;
  sku_id: string;
  planned_qty: number;
  picked_qty: number | null;
  status: string | null;
};

type ShipmentGetResult = {
  shipment: ShipmentListItem;
  lines: ShipmentLineItem[];
};

type ShipmentsResultOk<T> = {
  ok: true;
  data: T;
};

type ShipmentsResultError = {
  ok: false;
} & ParsedGasError;

export type ListShipmentsResult = ShipmentsResultOk<ShipmentListItem[]> | ShipmentsResultError;
export type GetShipmentResult = ShipmentsResultOk<ShipmentGetResult> | ShipmentsResultError;

type SheetReadResponse = {
  rows?: unknown;
  items?: unknown;
  data?: {
    rows?: unknown;
    items?: unknown;
  };
};

function normalizeString(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function normalizeNullableString(value: unknown): string | null {
  const normalized = normalizeString(value);
  return normalized.length > 0 ? normalized : null;
}

function normalizeNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeRequiredNumber(value: unknown): number {
  return normalizeNullableNumber(value) ?? 0;
}

function normalizeSheetRows(response: SheetReadResponse): unknown[] {
  const candidates = [response.rows, response.items, response.data?.rows, response.data?.items];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
}

function parseShipments(rows: unknown[]): ShipmentListItem[] {
  const items: ShipmentListItem[] = [];

  for (const row of rows) {
    if (typeof row !== "object" || row === null || Array.isArray(row)) {
      continue;
    }

    const record = row as Record<string, unknown>;
    const shipmentId = normalizeString(record.shipment_id);

    if (!shipmentId) {
      continue;
    }

    items.push({
      shipment_id: shipmentId,
      created_at: normalizeNullableString(record.created_at),
      status: normalizeNullableString(record.status),
      warehouse_key: normalizeNullableString(record.warehouse_key),
      planned_lines: normalizeNullableNumber(record.planned_lines),
      planned_qty: normalizeNullableNumber(record.planned_qty),
    });
  }

  return items;
}

function parseShipmentLines(rows: unknown[]): Array<{ shipment_id: string } & ShipmentLineItem> {
  const items: Array<{ shipment_id: string } & ShipmentLineItem> = [];

  for (const row of rows) {
    if (typeof row !== "object" || row === null || Array.isArray(row)) {
      continue;
    }

    const record = row as Record<string, unknown>;
    const shipmentId = normalizeString(record.shipment_id);
    const lineId = normalizeString(record.line_id);
    const skuId = normalizeString(record.sku_id);

    if (!shipmentId || !lineId || !skuId) {
      continue;
    }

    items.push({
      shipment_id: shipmentId,
      line_id: lineId,
      sku_id: skuId,
      planned_qty: normalizeRequiredNumber(record.planned_qty),
      picked_qty: normalizeNullableNumber(record.picked_qty),
      status: normalizeNullableString(record.status),
    });
  }

  return items;
}

function looksLikeUnknownAction(error: ParsedGasError): boolean {
  const lower = `${error.code} ${error.error}`.toLowerCase();
  return lower.includes("unknown action") || lower.includes("unsupported action") || error.code === "BAD_GATEWAY";
}

function normalizeSheetError(error: ParsedGasError): ParsedGasError {
  if (error.code === "SHEET_MISSING") {
    return error;
  }

  const lower = `${error.code} ${error.error}`.toLowerCase();
  if (lower.includes("sheet") && lower.includes("missing")) {
    return { ...error, code: "SHEET_MISSING" };
  }

  return error;
}

async function readSheetRows(requestId: string, sheetName: string): Promise<ShipmentsResultOk<unknown[]> | ShipmentsResultError> {
  let lastError: ParsedGasError = {
    code: "BAD_GATEWAY",
    error: "Bad gateway",
  };

  for (const action of SHEET_READ_ACTIONS) {
    const response = await callGas<SheetReadResponse>(action, { db: OPS_DB, sheet_name: sheetName }, requestId);

    if (response.ok && response.data) {
      return {
        ok: true,
        data: normalizeSheetRows(response.data),
      };
    }

    const parsed = normalizeSheetError(parseErrorPayload((response as { error?: unknown }).error));
    lastError = parsed;

    if (!looksLikeUnknownAction(parsed)) {
      break;
    }
  }

  return { ok: false, ...lastError };
}

export async function listShipments(requestId: string, limit: number): Promise<ListShipmentsResult> {
  const shipmentsRows = await readSheetRows(requestId, SHIPMENTS_SHEET);

  if (shipmentsRows.ok === false) {
    return shipmentsRows;
  }

  const items = parseShipments(shipmentsRows.data).slice(0, limit);
  return { ok: true, data: items };
}

export async function getShipmentWithLines(requestId: string, shipmentId: string): Promise<GetShipmentResult> {
  const shipmentsRows = await readSheetRows(requestId, SHIPMENTS_SHEET);

  if (shipmentsRows.ok === false) {
    return shipmentsRows;
  }

  const shipments = parseShipments(shipmentsRows.data);
  const shipment = shipments.find((item) => item.shipment_id === shipmentId);

  if (!shipment) {
    return {
      ok: false,
      code: "NOT_FOUND",
      error: "Shipment not found",
    };
  }

  const linesRows = await readSheetRows(requestId, SHIPMENT_LINES_SHEET);

  if (linesRows.ok === false) {
    return linesRows;
  }

  const lines = parseShipmentLines(linesRows.data)
    .filter((item) => item.shipment_id === shipmentId)
    .map(({ shipment_id: _shipmentId, ...line }) => line);

  return {
    ok: true,
    data: {
      shipment,
      lines,
    },
  };
}

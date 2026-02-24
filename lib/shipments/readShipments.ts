import { callGas } from "@/lib/integrations/gasClient";
import { parseErrorPayload, type ParsedGasError } from "@/lib/api/gasError";

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

type ShipmentsListResponse = {
  items?: unknown;
  data?: {
    items?: unknown;
  };
};

type ShipmentsGetResponse = {
  shipment?: unknown;
  lines?: unknown;
  data?: {
    shipment?: unknown;
    lines?: unknown;
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

function parseShipments(rows: unknown): ShipmentListItem[] {
  if (!Array.isArray(rows)) {
    return [];
  }

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

function parseLines(rows: unknown): ShipmentLineItem[] {
  if (!Array.isArray(rows)) {
    return [];
  }

  const items: ShipmentLineItem[] = [];

  for (const row of rows) {
    if (typeof row !== "object" || row === null || Array.isArray(row)) {
      continue;
    }

    const record = row as Record<string, unknown>;
    const lineId = normalizeString(record.line_id);
    const skuId = normalizeString(record.sku_id);

    if (!lineId || !skuId) {
      continue;
    }

    items.push({
      line_id: lineId,
      sku_id: skuId,
      planned_qty: normalizeRequiredNumber(record.planned_qty),
      picked_qty: normalizeNullableNumber(record.picked_qty),
      status: normalizeNullableString(record.status),
    });
  }

  return items;
}

function normalizeError(error: unknown): ParsedGasError {
  const parsed = parseErrorPayload(error);
  const lower = `${parsed.code} ${parsed.error}`.toLowerCase();

  if (parsed.code === "SHEET_MISSING") {
    return parsed;
  }

  if (lower.includes("sheet") && lower.includes("missing")) {
    return {
      ...parsed,
      code: "SHEET_MISSING",
    };
  }

  return parsed;
}

export async function listShipments(requestId: string, limit: number): Promise<ListShipmentsResult> {
  const response = await callGas<ShipmentsListResponse>("shipments.list", { limit }, requestId);

  if (!response.ok) {
    return { ok: false, ...normalizeError((response as { error?: unknown }).error) };
  }

  const payload = response.data;
  const rawItems = payload?.items ?? payload?.data?.items;
  return {
    ok: true,
    data: parseShipments(rawItems),
  };
}

export async function getShipmentWithLines(requestId: string, shipmentId: string): Promise<GetShipmentResult> {
  const response = await callGas<ShipmentsGetResponse>("shipments.get", { shipment_id: shipmentId }, requestId);

  if (!response.ok) {
    return { ok: false, ...normalizeError((response as { error?: unknown }).error) };
  }

  const payload = response.data;
  const rawShipment = payload?.shipment ?? payload?.data?.shipment;
  const rawLines = payload?.lines ?? payload?.data?.lines;

  const shipments = parseShipments(rawShipment ? [rawShipment] : []);
  const shipment = shipments[0];

  if (!shipment) {
    return {
      ok: false,
      code: "NOT_FOUND",
      error: "Shipment not found",
    };
  }

  return {
    ok: true,
    data: {
      shipment,
      lines: parseLines(rawLines),
    },
  };
}

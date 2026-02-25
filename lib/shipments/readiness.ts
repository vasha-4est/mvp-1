import { parseErrorPayload, type ParsedGasError } from "@/lib/api/gasError";
import { callGas } from "@/lib/integrations/gasClient";
import { getShipmentWithLines, listShipments } from "@/lib/shipments/readShipments";

export type ShipmentReadinessItem = {
  shipment_id: string;
  status: "READY" | "PARTIAL" | "BLOCKED";
  readiness_percent: number;
  total_planned_qty: number;
  total_ready_qty: number;
  total_missing_qty: number;
};

type ShipmentReadinessResult =
  | { ok: true; shipments: ShipmentReadinessItem[] }
  | ({ ok: false } & ParsedGasError);

type InventoryBalanceRow = {
  sku_id?: unknown;
  reserved_qty?: unknown;
};

type InventoryBalanceResponse = {
  balances?: unknown;
};

function normalizeNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeError(error: unknown, fallback: string): ParsedGasError {
  const parsed = parseErrorPayload(error);
  return {
    ...parsed,
    error: parsed.error || fallback,
  };
}

function calculateStatus(totalReadyQty: number, totalMissingQty: number): "READY" | "PARTIAL" | "BLOCKED" {
  if (totalReadyQty === 0) {
    return "BLOCKED";
  }

  if (totalMissingQty === 0) {
    return "READY";
  }

  return "PARTIAL";
}

async function getReservedQtyBySku(requestId: string): Promise<{ ok: true; bySku: Map<string, number> } | ({ ok: false } & ParsedGasError)> {
  const response = await callGas<InventoryBalanceResponse>("inventory.balance.get", { sku_id: "", location_id: "" }, requestId, {
    timeoutMs: 25_000,
    retries: 2,
    retryBackoffMs: 500,
  });

  if (!response.ok || !response.data) {
    return { ok: false, ...normalizeError(response.error, "Failed to read inventory balances") };
  }

  const balances = Array.isArray(response.data.balances) ? (response.data.balances as InventoryBalanceRow[]) : [];
  const bySku = new Map<string, number>();

  for (const balance of balances) {
    const skuId = normalizeString(balance.sku_id);
    if (!skuId) {
      continue;
    }

    const reservedQty = normalizeNumber(balance.reserved_qty);
    bySku.set(skuId, (bySku.get(skuId) ?? 0) + reservedQty);
  }

  return { ok: true, bySku };
}

export async function getShipmentsReadiness(requestId: string): Promise<ShipmentReadinessResult> {
  const shipmentsResponse = await listShipments(requestId, 10_000);
  if (shipmentsResponse.ok === false) {
    return shipmentsResponse;
  }

  const reservedQtyResponse = await getReservedQtyBySku(requestId);
  if (reservedQtyResponse.ok === false) {
    return reservedQtyResponse;
  }

  const openShipments = shipmentsResponse.data.filter((item) => item.status?.toLowerCase() !== "closed");

  const shipments = await Promise.all(
    openShipments.map(async (shipment) => {
      const detailsResponse = await getShipmentWithLines(requestId, shipment.shipment_id);
      if (detailsResponse.ok === false) {
        return { ok: false as const, error: detailsResponse };
      }

      let totalPlannedQty = 0;
      let totalReadyQty = 0;

      for (const line of detailsResponse.data.lines) {
        const plannedQty = Math.max(0, normalizeNumber(line.planned_qty));
        const reservedQty = reservedQtyResponse.bySku.get(line.sku_id) ?? 0;
        const readyQty = Math.min(reservedQty, plannedQty);

        totalPlannedQty += plannedQty;
        totalReadyQty += readyQty;
      }

      const totalMissingQty = Math.max(0, totalPlannedQty - totalReadyQty);
      const readinessPercent =
        totalPlannedQty === 0 ? 0 : Math.floor((Math.max(0, totalReadyQty) / totalPlannedQty) * 100);

      return {
        ok: true as const,
        item: {
          shipment_id: shipment.shipment_id,
          status: calculateStatus(totalReadyQty, totalMissingQty),
          readiness_percent: readinessPercent,
          total_planned_qty: totalPlannedQty,
          total_ready_qty: totalReadyQty,
          total_missing_qty: totalMissingQty,
        },
      };
    })
  );

  for (const shipment of shipments) {
    if (shipment.ok === false) {
      return shipment.error;
    }
  }

  return {
    ok: true,
    shipments: shipments.map((item) => item.item),
  };
}

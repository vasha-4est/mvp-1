import { getInventoryBalances } from "@/lib/inventory/getInventoryBalances";
import { getShipmentWithLines } from "@/lib/shipments/readShipments";

type DraftError = {
  ok: false;
  code: string;
  error: string;
  details?: Record<string, unknown>;
};

export type PickingDraftLine = {
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

export type PickingDraftResult =
  | {
      ok: true;
      shipment: {
        shipment_id: string;
        direction: string | null;
        counterparty: string | null;
        destination: string | null;
        destination_warehouse: string | null;
        planned_date: string | null;
        deadline_at: string | null;
        warehouse_key: string | null;
        status: string | null;
        planned_lines: number | null;
        planned_qty: number | null;
      };
      summary: {
        shipment_line_count: number;
        actionable_line_count: number;
        shortage_line_count: number;
        total_outstanding_qty: number;
        total_suggested_qty: number;
        total_short_qty: number;
      };
      lines: PickingDraftLine[];
    }
  | DraftError;

type BalanceCandidate = {
  location_id: string;
  available_qty: number;
  updated_at: string | null;
};

export async function getPickingDraft(requestId: string, shipmentId: string): Promise<PickingDraftResult> {
  const shipmentResult = await getShipmentWithLines(`${requestId}:shipment`, shipmentId);
  if (shipmentResult.ok === false) {
    return shipmentResult;
  }

  const skuIds = Array.from(new Set(shipmentResult.data.lines.map((line) => line.sku_id.trim()).filter(Boolean)));
  const balanceResponses = await Promise.all(
    skuIds.map(async (skuId) => ({
      skuId,
      balance: await getInventoryBalances(`${requestId}:inventory:${skuId}`, { sku_id: skuId }),
    }))
  );

  for (const entry of balanceResponses) {
    if (entry.balance.ok === false) {
      return {
        ok: false,
        code: "BAD_GATEWAY",
        error: entry.balance.error || "Failed to load inventory balances",
      };
    }
  }

  const balancesBySku = new Map<string, BalanceCandidate[]>();
  for (const entry of balanceResponses) {
    if (entry.balance.ok === false) {
      continue;
    }

    balancesBySku.set(
      entry.skuId,
      entry.balance.items
        .filter((item) => item.available_qty > 0 && item.location_id.trim().length > 0)
        .map((item) => ({
          location_id: item.location_id.trim(),
          available_qty: item.available_qty,
          updated_at: item.updated_at || null,
        }))
        .sort((left, right) => {
          if (right.available_qty !== left.available_qty) {
            return right.available_qty - left.available_qty;
          }

          return left.location_id.localeCompare(right.location_id);
        })
    );
  }

  const draftLines: PickingDraftLine[] = [];

  for (const shipmentLine of shipmentResult.data.lines) {
    const pickedQty = shipmentLine.picked_qty ?? 0;
    const outstandingQty = Math.max(0, shipmentLine.planned_qty - pickedQty);
    if (outstandingQty <= 0) {
      continue;
    }

    const balances = balancesBySku.get(shipmentLine.sku_id.trim()) ?? [];
    let remainingQty = outstandingQty;

    for (const balance of balances) {
      if (remainingQty <= 0) {
        break;
      }

      const suggestedQty = Math.min(remainingQty, balance.available_qty);
      if (suggestedQty <= 0) {
        continue;
      }

      remainingQty -= suggestedQty;
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

    if (remainingQty > 0) {
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
        short_qty: remainingQty,
        state: "short",
        updated_at: null,
      });
    }
  }

  const uniqueOutstanding = new Map<string, number>();
  for (const line of draftLines) {
    if (!uniqueOutstanding.has(line.shipment_line_id)) {
      uniqueOutstanding.set(line.shipment_line_id, line.outstanding_qty);
    }
  }

  return {
    ok: true,
    shipment: {
      shipment_id: shipmentResult.data.shipment.shipment_id,
      direction: shipmentResult.data.shipment.direction,
      counterparty: shipmentResult.data.shipment.counterparty,
      destination: shipmentResult.data.shipment.destination,
      destination_warehouse: shipmentResult.data.shipment.destination_warehouse,
      planned_date: shipmentResult.data.shipment.planned_date,
      deadline_at: shipmentResult.data.shipment.deadline_at,
      warehouse_key: shipmentResult.data.shipment.warehouse_key,
      status: shipmentResult.data.shipment.status,
      planned_lines: shipmentResult.data.shipment.planned_lines,
      planned_qty: shipmentResult.data.shipment.planned_qty,
    },
    summary: {
      shipment_line_count: shipmentResult.data.lines.length,
      actionable_line_count: draftLines.filter((line) => line.state === "ready" && line.suggested_qty > 0).length,
      shortage_line_count: draftLines.filter((line) => line.state === "short" || line.short_qty > 0).length,
      total_outstanding_qty: Array.from(uniqueOutstanding.values()).reduce((sum, value) => sum + value, 0),
      total_suggested_qty: draftLines.reduce((sum, line) => sum + line.suggested_qty, 0),
      total_short_qty: draftLines.reduce((sum, line) => sum + line.short_qty, 0),
    },
    lines: draftLines,
  };
}

import { parseErrorPayload, type ParsedGasError } from "@/lib/api/gasError";
import { getInventoryBalances } from "@/lib/inventory/getInventoryBalances";
import { readLatestStagedShipmentPlanBatch } from "@/lib/shipmentPlan/readLatestStagedBatch";

type ShipmentPlanRow = {
  shipment_id: string;
  deadline_at: string | null;
  products_sku: string;
  planned_qty: number;
};

export type ProductionPlanItem = {
  sku_id: string;
  demand_qty: number;
  available_qty: number;
  covered_qty: number;
  production_qty: number;
  shipment_count: number;
  shipment_ids: string[];
  earliest_deadline_at: string | null;
  latest_deadline_at: string | null;
  coverage_status: "covered" | "short";
  priority_reason: string;
};

export type ProductionPlanSummary = {
  shipment_count: number;
  sku_count: number;
  demand_qty: number;
  available_qty: number;
  covered_qty: number;
  production_qty: number;
  uncovered_qty: number;
  urgent_skus: number;
};

export type ProductionPlanPayload = {
  ok: true;
  generated_at: string;
  import_batch_id: string | null;
  summary: ProductionPlanSummary;
  items: ProductionPlanItem[];
};

type ProductionPlanResult = { ok: true; data: ProductionPlanPayload } | ({ ok: false } & ParsedGasError);

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

function normalizeError(error: unknown, fallback: string): ParsedGasError {
  const parsed = parseErrorPayload(error);
  return {
    ...parsed,
    error: parsed.error || fallback,
  };
}

function toIsoOrNull(value: string | null | undefined): string | null {
  if (!value) return null;

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function compareDates(left: string | null, right: string | null): number {
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;

  return Date.parse(left) - Date.parse(right);
}

function priorityReason(params: {
  productionQty: number;
  earliestDeadlineAt: string | null;
  shipmentCount: number;
}): string {
  if (params.productionQty <= 0) {
    return params.shipmentCount === 0 ? "No shipment demand" : "Covered by inventory";
  }

  if (params.earliestDeadlineAt) {
    return `Needs ${params.productionQty} before ${params.earliestDeadlineAt}`;
  }

  return `Needs ${params.productionQty} for ${params.shipmentCount} shipment(s)`;
}

function summarizeItems(items: ProductionPlanItem[], shipmentCount: number): ProductionPlanSummary {
  return items.reduce<ProductionPlanSummary>(
    (acc, item) => {
      acc.sku_count += 1;
      acc.demand_qty += item.demand_qty;
      acc.available_qty += item.available_qty;
      acc.covered_qty += item.covered_qty;
      acc.production_qty += item.production_qty;
      acc.uncovered_qty += item.production_qty;
      if (item.production_qty > 0) {
        acc.urgent_skus += 1;
      }
      return acc;
    },
    {
      shipment_count: shipmentCount,
      sku_count: 0,
      demand_qty: 0,
      available_qty: 0,
      covered_qty: 0,
      production_qty: 0,
      uncovered_qty: 0,
      urgent_skus: 0,
    }
  );
}

function buildInventoryMap(items: Array<{ sku_id: string; available_qty: number }>): Map<string, number> {
  const bySku = new Map<string, number>();
  for (const item of items) {
    if (!item.sku_id) continue;
    bySku.set(item.sku_id, (bySku.get(item.sku_id) ?? 0) + Math.max(0, normalizeNumber(item.available_qty)));
  }
  return bySku;
}

export async function getProductionPlan(requestId: string): Promise<ProductionPlanResult> {
  const generatedAt = new Date();

  const planResponse = await readLatestStagedShipmentPlanBatch(requestId);
  if (planResponse.ok === false) {
    return planResponse;
  }

  if (planResponse.rows.length === 0) {
    return {
      ok: true,
      data: {
        ok: true,
        generated_at: generatedAt.toISOString(),
        import_batch_id: null,
        summary: {
          shipment_count: 0,
          sku_count: 0,
          demand_qty: 0,
          available_qty: 0,
          covered_qty: 0,
          production_qty: 0,
          uncovered_qty: 0,
          urgent_skus: 0,
        },
        items: [],
      },
    };
  }

  const inventoryResponse = await getInventoryBalances(requestId);
  if (inventoryResponse.ok === false) {
    return { ok: false, ...normalizeError(inventoryResponse.error, "Failed to read inventory balances") };
  }

  const availableBySku = buildInventoryMap(inventoryResponse.items);
  const grouped = new Map<
    string,
    {
      sku_id: string;
      shipment_ids: Set<string>;
      demand_qty: number;
      available_qty: number;
      earliest_deadline_at: string | null;
      latest_deadline_at: string | null;
    }
  >();

  const uniqueShipmentIds = new Set<string>();

  for (const row of planResponse.rows) {
    const skuId = row.products_sku.trim();
    const shipmentId = row.shipment_id.trim();
    if (!skuId || !shipmentId) continue;

    uniqueShipmentIds.add(shipmentId);

    const current = grouped.get(skuId) ?? {
      sku_id: skuId,
      shipment_ids: new Set<string>(),
      demand_qty: 0,
      available_qty: availableBySku.get(skuId) ?? 0,
      earliest_deadline_at: null,
      latest_deadline_at: null,
    };

    current.shipment_ids.add(shipmentId);
    current.demand_qty += Math.max(0, normalizeNumber(row.planned_qty));
    current.available_qty = availableBySku.get(skuId) ?? current.available_qty;

    const deadlineAt = toIsoOrNull(row.deadline_at);
    if (deadlineAt) {
      current.earliest_deadline_at =
        current.earliest_deadline_at === null || compareDates(deadlineAt, current.earliest_deadline_at) < 0
          ? deadlineAt
          : current.earliest_deadline_at;
      current.latest_deadline_at =
        current.latest_deadline_at === null || compareDates(deadlineAt, current.latest_deadline_at) > 0
          ? deadlineAt
          : current.latest_deadline_at;
    }

    grouped.set(skuId, current);
  }

  const items = Array.from(grouped.values())
    .map((item) => {
      const demandQty = Math.max(0, item.demand_qty);
      const availableQty = Math.max(0, item.available_qty);
      const coveredQty = Math.min(demandQty, availableQty);
      const productionQty = Math.max(demandQty - availableQty, 0);

      return {
        sku_id: item.sku_id,
        demand_qty: demandQty,
        available_qty: availableQty,
        covered_qty: coveredQty,
        production_qty: productionQty,
        shipment_count: item.shipment_ids.size,
        shipment_ids: Array.from(item.shipment_ids).sort((left, right) => left.localeCompare(right)),
        earliest_deadline_at: item.earliest_deadline_at,
        latest_deadline_at: item.latest_deadline_at,
        coverage_status: productionQty > 0 ? "short" : "covered",
        priority_reason: priorityReason({
          productionQty,
          earliestDeadlineAt: item.earliest_deadline_at,
          shipmentCount: item.shipment_ids.size,
        }),
      } satisfies ProductionPlanItem;
    })
    .sort(
      (left, right) =>
        compareDates(left.earliest_deadline_at, right.earliest_deadline_at) ||
        right.production_qty - left.production_qty ||
        right.demand_qty - left.demand_qty ||
        left.sku_id.localeCompare(right.sku_id)
    );

  const summary = summarizeItems(items, uniqueShipmentIds.size);
  const actionableItems = items.filter((item) => item.production_qty > 0);

  return {
    ok: true,
    data: {
      ok: true,
      generated_at: generatedAt.toISOString(),
      import_batch_id: planResponse.import_batch_id,
      summary,
      items: actionableItems,
    },
  };
}

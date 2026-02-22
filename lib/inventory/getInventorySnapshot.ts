import { callGas } from "@/lib/integrations/gasClient";

const FINAL_STATUSES = new Set(["closed", "final"]);

type BatchRegistryRow = {
  sku_id?: unknown;
  planned_qty?: unknown;
  status?: unknown;
};

type BatchListResponse = {
  items?: BatchRegistryRow[];
};

export type InventorySnapshotItem = {
  sku_id: string;
  total_available: number;
};

export type InventorySnapshotResult =
  | {
      ok: true;
      items: InventorySnapshotItem[];
    }
  | {
      ok: false;
      error: string;
    };

function normalizeSkuId(value: unknown): string {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

function normalizeStatus(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : String(value ?? "").trim().toLowerCase();
}

function parsePlannedQty(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const parsed = Number(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getInventorySnapshot(requestId: string): Promise<InventorySnapshotResult> {
  const response = await callGas<BatchListResponse>("batch_list", {}, requestId);

  if (!response.ok || !response.data || !Array.isArray(response.data.items)) {
    return {
      ok: false,
      error: "Failed to load batch registry",
    };
  }

  const totalsBySku = new Map<string, number>();

  for (const row of response.data.items) {
    const status = normalizeStatus(row.status);
    if (!FINAL_STATUSES.has(status)) {
      continue;
    }

    const skuId = normalizeSkuId(row.sku_id);
    if (!skuId) {
      continue;
    }

    const plannedQty = parsePlannedQty(row.planned_qty);
    totalsBySku.set(skuId, (totalsBySku.get(skuId) ?? 0) + plannedQty);
  }

  const items = Array.from(totalsBySku.entries())
    .map(([sku_id, total_available]) => ({ sku_id, total_available }))
    .sort((left, right) => left.sku_id.localeCompare(right.sku_id));

  return {
    ok: true,
    items,
  };
}

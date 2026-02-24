import { getBomForSet } from "@/lib/bom/getBomForSet";
import { listCatalogSkus } from "@/lib/catalog/listSkus";
import { getInventorySnapshot } from "@/lib/inventory/getInventorySnapshot";

export type AssemblyCapacityItem = {
  set_sku: string;
  availability: number;
  bottleneck_component: string | null;
  component_shortage: boolean;
};

type AssemblyCapacityResult =
  | { ok: true; items: AssemblyCapacityItem[] }
  | { ok: false; error: string; code?: string; details?: Record<string, unknown> };

export async function getAssemblyCapacity(requestId: string): Promise<AssemblyCapacityResult> {
  const [catalogResult, snapshotResult] = await Promise.all([
    listCatalogSkus(requestId, { type: "set", active: 1 }),
    getInventorySnapshot(requestId),
  ]);

  if (catalogResult.ok === false) {
    return {
      ok: false,
      error: catalogResult.error,
      code: catalogResult.code,
      ...(catalogResult.details ? { details: catalogResult.details } : {}),
    };
  }

  if (snapshotResult.ok === false) {
    return {
      ok: false,
      error: snapshotResult.error,
      code: "BAD_GATEWAY",
    };
  }

  const inventoryBySku = new Map(snapshotResult.items.map((item) => [item.sku_id, item.total_available]));
  const items: AssemblyCapacityItem[] = [];

  for (const sku of catalogResult.items) {
    const bomResult = await getBomForSet(requestId, sku.sku_id);

    if (bomResult.ok === false) {
      items.push({
        set_sku: sku.sku_id,
        availability: 0,
        bottleneck_component: null,
        component_shortage: false,
      });
      continue;
    }

    let availability = Number.POSITIVE_INFINITY;
    let bottleneckComponent: string | null = null;

    for (const component of bomResult.components) {
      const available = inventoryBySku.get(component.component_sku) ?? 0;
      const componentCapacity = Math.floor(available / component.qty);

      if (componentCapacity < availability) {
        availability = componentCapacity;
        bottleneckComponent = component.component_sku;
      }
    }

    if (!Number.isFinite(availability)) {
      availability = 0;
      bottleneckComponent = null;
    }

    items.push({
      set_sku: sku.sku_id,
      availability,
      bottleneck_component: bottleneckComponent,
      component_shortage: availability === 0 && bomResult.components.length > 0,
    });
  }

  return {
    ok: true,
    items: items.sort((left, right) => left.set_sku.localeCompare(right.set_sku)),
  };
}

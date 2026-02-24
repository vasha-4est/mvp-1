export type AvailabilityBomComponent = {
  component_sku: string;
  qty: number;
};

export type AvailabilityInventoryItem = {
  sku_id: string;
  total_available: number;
};

export type AvailabilityOverlay = {
  availability: number;
  bottleneck_component: string | null;
  component_shortage: boolean;
};

function normalizePositiveNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 0 ? value : 0;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return 0;
}

export function calculateAvailability(
  bom_components: AvailabilityBomComponent[],
  inventory_snapshot: AvailabilityInventoryItem[]
): AvailabilityOverlay {
  if (bom_components.length === 0) {
    return {
      availability: 0,
      bottleneck_component: null,
      component_shortage: false,
    };
  }

  const inventoryBySku = new Map<string, number>();

  for (const item of inventory_snapshot) {
    const sku = typeof item.sku_id === "string" ? item.sku_id.trim() : "";
    if (!sku) {
      continue;
    }

    inventoryBySku.set(sku, normalizePositiveNumber(item.total_available));
  }

  let minSetsPossible = Number.POSITIVE_INFINITY;
  let bottleneckComponent: string | null = null;

  for (const component of bom_components) {
    const componentSku = typeof component.component_sku === "string" ? component.component_sku.trim() : "";
    const requiredQty = normalizePositiveNumber(component.qty);

    if (!componentSku || requiredQty <= 0) {
      continue;
    }

    const availableQty = inventoryBySku.get(componentSku) ?? 0;
    const setsPossible = Math.floor(availableQty / requiredQty);

    if (setsPossible < minSetsPossible) {
      minSetsPossible = setsPossible;
      bottleneckComponent = componentSku;
    }
  }

  if (!Number.isFinite(minSetsPossible)) {
    return {
      availability: 0,
      bottleneck_component: null,
      component_shortage: false,
    };
  }

  return {
    availability: minSetsPossible,
    bottleneck_component: bottleneckComponent,
    component_shortage: minSetsPossible === 0,
  };
}

export type AssemblyBomComponent = {
  sku: string;
  requiredQty: number;
};

export type AssemblySetSku = {
  sku: string;
  name: string;
  components: AssemblyBomComponent[];
};

type RawRecord = Record<string, unknown>;

function asRecord(value: unknown): RawRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as RawRecord;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function resolveSku(record: RawRecord): string | null {
  return asString(record.sku) ?? asString(record.code) ?? asString(record.id);
}

function resolveSkuType(record: RawRecord): string | null {
  return asString(record.sku_type) ?? asString(record.skuType) ?? asString(record.type);
}

function compareSets(left: AssemblySetSku, right: AssemblySetSku): number {
  return left.name.localeCompare(right.name) || left.sku.localeCompare(right.sku);
}

export function normalizeAssemblySetSkus(items: unknown[]): AssemblySetSku[] {
  const normalized: AssemblySetSku[] = [];

  for (const item of items) {
    const record = asRecord(item);
    if (!record) {
      continue;
    }

    const skuType = resolveSkuType(record)?.toLowerCase();
    if (skuType !== "set") {
      continue;
    }

    const sku = resolveSku(record);
    if (!sku) {
      continue;
    }

    const name =
      asString(record.name) ??
      asString(record.sku_name) ??
      asString(record.skuName) ??
      asString(record.product_name) ??
      asString(record.productName) ??
      sku;

    normalized.push({
      sku,
      name,
      components: [],
    });
  }

  return normalized.sort(compareSets);
}

export function normalizeAssemblyBomComponents(items: unknown[]): AssemblyBomComponent[] {
  const normalized: AssemblyBomComponent[] = [];

  for (const item of items) {
    const record = asRecord(item);
    if (!record) {
      continue;
    }

    const sku =
      asString(record.component_sku) ??
      asString(record.componentSku) ??
      asString(record.sku) ??
      asString(record.code) ??
      asString(record.id);

    if (!sku) {
      continue;
    }

    const requiredQty = asNumber(
      record.required_qty ?? record.requiredQty ?? record.qty_per_set ?? record.qtyPerSet ?? record.quantity ?? record.qty
    );

    normalized.push({ sku, requiredQty });
  }

  return normalized.sort((left, right) => left.sku.localeCompare(right.sku));
}

export function filterAssemblySetSkus(items: AssemblySetSku[], query: string): AssemblySetSku[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return items;
  }

  return items.filter((item) => {
    if (item.sku.toLowerCase().includes(normalizedQuery) || item.name.toLowerCase().includes(normalizedQuery)) {
      return true;
    }

    return item.components.some((component) => component.sku.toLowerCase().includes(normalizedQuery));
  });
}

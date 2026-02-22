import { callGas } from "@/lib/integrations/gasClient";

export type CatalogSku = {
  sku: string;
  sku_name: string;
  sku_type: string;
};

export class CatalogFetchError extends Error {}

type RawRecord = Record<string, unknown>;

type ProductsSkuResponse = {
  data?: unknown;
  items?: unknown;
  rows?: unknown;
  skus?: unknown;
};

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

function pickRows(payload: ProductsSkuResponse): unknown[] {
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.rows)) return payload.rows;
  if (Array.isArray(payload.skus)) return payload.skus;
  return [];
}

function normalizeSkus(rows: unknown[]): CatalogSku[] {
  const normalized: CatalogSku[] = [];

  for (const row of rows) {
    const record = asRecord(row);
    if (!record) {
      continue;
    }

    const sku = asString(record.sku) ?? asString(record.code) ?? asString(record.id);
    if (!sku) {
      continue;
    }

    const sku_name =
      asString(record.sku_name) ??
      asString(record.skuName) ??
      asString(record.name) ??
      asString(record.product_name) ??
      sku;

    const sku_type = asString(record.sku_type) ?? asString(record.skuType) ?? asString(record.type) ?? "";

    normalized.push({ sku, sku_name, sku_type });
  }

  return normalized.sort((left, right) => left.sku.localeCompare(right.sku));
}

export async function listCatalogSkus(requestId: string): Promise<CatalogSku[]> {
  const response = await callGas<ProductsSkuResponse>("control_model.products_sku.read", {}, requestId);

  if (!response.ok || !response.data) {
    throw new CatalogFetchError("Failed to read products_sku");
  }

  return normalizeSkus(pickRows(response.data));
}

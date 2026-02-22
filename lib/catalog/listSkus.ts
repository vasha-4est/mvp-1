import { callGas } from "@/lib/integrations/gasClient";

export type CatalogSku = {
  sku: string;
  sku_name: string;
  sku_type: string;
};

export class CatalogFetchError extends Error {}

type RawRecord = Record<string, unknown>;

type CatalogBootstrapResponse = {
  data?: unknown;
  sku?: unknown;
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

function asSkuRows(payload: CatalogBootstrapResponse): unknown[] {
  if (Array.isArray(payload.sku)) {
    return payload.sku;
  }

  const data = asRecord(payload.data);
  if (!data) {
    return [];
  }

  if (Array.isArray(data.sku)) {
    return data.sku;
  }

  const nestedData = asRecord(data.data);
  if (nestedData && Array.isArray(nestedData.sku)) {
    return nestedData.sku;
  }

  return [];
}

function normalizeSkus(rows: unknown[]): CatalogSku[] {
  const normalized: CatalogSku[] = [];

  for (const row of rows) {
    const record = asRecord(row);
    if (!record) {
      continue;
    }

    const sku = asString(record.sku_id) ?? asString(record.sku) ?? asString(record.code) ?? asString(record.id);
    if (!sku) {
      continue;
    }

    const sku_name = asString(record.sku_name) ?? asString(record.name) ?? sku;
    const sku_type = asString(record.sku_type) ?? asString(record.type) ?? "";

    normalized.push({ sku, sku_name, sku_type });
  }

  return normalized.sort((left, right) => left.sku.localeCompare(right.sku));
}

export async function listCatalogSkus(requestId: string): Promise<CatalogSku[]> {
  const response = await callGas<CatalogBootstrapResponse>("catalog.bootstrap", {}, requestId);

  if (!response.ok || !response.data) {
    throw new CatalogFetchError("Failed to load catalog bootstrap");
  }

  return normalizeSkus(asSkuRows(response.data));
}

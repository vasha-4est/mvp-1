import { parseErrorPayload } from "@/lib/api/gasError";
import { callGas } from "@/lib/integrations/gasClient";
import {
  normalizeCatalogSku,
  type CatalogSku,
  type ProductsSkuSchemaError,
  type SkuType,
  validateProductsSkuSchema,
} from "@/lib/validators/productsSku";

type GasProductsSkuResponse = {
  headers?: unknown[];
  items?: unknown[];
  rows?: unknown[];
};

export type ListCatalogSkusParams = {
  type?: SkuType;
  active: 0 | 1;
};

type ListCatalogSkusResult =
  | { ok: true; items: CatalogSku[] }
  | { ok: false; error: string; code: string; details?: Record<string, unknown> };

function toErrorResult(raw: unknown, fallback: string): Extract<ListCatalogSkusResult, { ok: false }> {
  const parsed = parseErrorPayload(raw);
  return {
    ok: false,
    error: parsed.error || fallback,
    code: parsed.code,
    ...(parsed.details ? { details: parsed.details } : {}),
  };
}

function isSchemaError(value: ProductsSkuSchemaError | null): value is ProductsSkuSchemaError {
  return Boolean(value);
}

export async function listCatalogSkus(requestId: string, params: ListCatalogSkusParams): Promise<ListCatalogSkusResult> {
  const response = await callGas<GasProductsSkuResponse>("catalog.products_sku.read", {}, requestId);

  if (!response.ok || !response.data) {
    return toErrorResult(response.error, "Failed to read products_sku");
  }

  const headers = Array.isArray(response.data.headers) ? response.data.headers : [];
  const schemaError = validateProductsSkuSchema(headers);

  if (isSchemaError(schemaError)) {
    return {
      ok: false,
      error: schemaError.message,
      code: schemaError.code,
      details: schemaError.details,
    };
  }

  const sourceRows = Array.isArray(response.data.items)
    ? response.data.items
    : Array.isArray(response.data.rows)
      ? response.data.rows
      : [];

  const normalized: CatalogSku[] = [];
  for (const row of sourceRows) {
    const sku = normalizeCatalogSku(row);
    if (!sku) continue;
    if (params.active !== sku.active) continue;
    if (params.type && sku.sku_type !== params.type) continue;

    normalized.push(sku);
  }

  return { ok: true, items: normalized };
}

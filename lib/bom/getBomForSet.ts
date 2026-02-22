import { parseErrorPayload } from "@/lib/api/gasError";
import { callGas } from "@/lib/integrations/gasClient";
import { normalizeCatalogSku, validateProductsSkuSchema } from "@/lib/validators/productsSku";

type GasProductsSkuResponse = {
  headers?: unknown[];
  items?: unknown[];
  rows?: unknown[];
};

type GasBomResponse = {
  items?: unknown[];
  rows?: unknown[];
};

export type BomComponent = {
  component_sku: string;
  qty: number;
};

type GetBomForSetResult =
  | { ok: true; set_sku: string; components: BomComponent[] }
  | { ok: false; error: string; code: string; details?: Record<string, unknown> };

function toErrorResult(raw: unknown, fallback: string): Extract<GetBomForSetResult, { ok: false }> {
  const parsed = parseErrorPayload(raw);
  return {
    ok: false,
    error: parsed.error || fallback,
    code: parsed.code,
    ...(parsed.details ? { details: parsed.details } : {}),
  };
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeQty(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function getRows(response: { items?: unknown[]; rows?: unknown[] } | null | undefined): unknown[] {
  if (!response) return [];
  if (Array.isArray(response.items)) return response.items;
  if (Array.isArray(response.rows)) return response.rows;
  return [];
}

export async function getBomForSet(requestId: string, setSkuParam: string): Promise<GetBomForSetResult> {
  const setSku = normalizeString(setSkuParam);
  if (!setSku) {
    return {
      ok: false,
      error: "Invalid set_sku",
      code: "BAD_REQUEST",
    };
  }

  const catalogResponse = await callGas<GasProductsSkuResponse>("catalog.products_sku.read", {}, requestId);
  if (!catalogResponse.ok || !catalogResponse.data) {
    return toErrorResult(catalogResponse.error, "Failed to read products_sku");
  }

  const headers = Array.isArray(catalogResponse.data.headers) ? catalogResponse.data.headers : [];
  const schemaError = validateProductsSkuSchema(headers);
  if (schemaError) {
    return {
      ok: false,
      error: schemaError.message,
      code: schemaError.code,
      details: schemaError.details,
    };
  }

  const catalogRows = getRows(catalogResponse.data);
  const catalog = catalogRows
    .map(normalizeCatalogSku)
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const setSkuRow = catalog.find((sku) => sku.sku_id === setSku);
  if (!setSkuRow) {
    return {
      ok: false,
      error: "Set SKU not found",
      code: "NOT_FOUND",
    };
  }

  if (setSkuRow.sku_type !== "set") {
    return {
      ok: false,
      error: "SKU is not a set",
      code: "BAD_REQUEST",
    };
  }

  const knownSkus = new Set(catalog.map((sku) => sku.sku_id));

  const bomResponse = await callGas<GasBomResponse>("sku_bom_read", { set_sku: setSku }, requestId);
  if (!bomResponse.ok || !bomResponse.data) {
    return toErrorResult(bomResponse.error, "Failed to read BOM");
  }

  const bomRows = getRows(bomResponse.data);
  if (bomRows.length === 0) {
    return {
      ok: false,
      error: "BOM not found",
      code: "NOT_FOUND",
    };
  }

  const components: BomComponent[] = [];

  for (const rawRow of bomRows) {
    if (typeof rawRow !== "object" || rawRow === null) {
      return {
        ok: false,
        error: "Invalid BOM row payload",
        code: "BAD_REQUEST",
      };
    }

    const row = rawRow as Record<string, unknown>;
    const rowSetSku = normalizeString(row.set_sku);
    const componentSku = normalizeString(row.component_sku);
    const qty = normalizeQty(row.qty);

    if (!rowSetSku || rowSetSku !== setSku) {
      return {
        ok: false,
        error: "BOM row set_sku mismatch",
        code: "BAD_REQUEST",
      };
    }

    if (!componentSku) {
      return {
        ok: false,
        error: "component_sku is required",
        code: "BAD_REQUEST",
      };
    }

    if (!knownSkus.has(componentSku)) {
      return {
        ok: false,
        error: `Unknown component_sku: ${componentSku}`,
        code: "BAD_REQUEST",
      };
    }

    if (qty === null || qty <= 0) {
      return {
        ok: false,
        error: `Invalid qty for component_sku: ${componentSku}`,
        code: "BAD_REQUEST",
      };
    }

    components.push({ component_sku: componentSku, qty });
  }

  return {
    ok: true,
    set_sku: setSku,
    components,
  };
}

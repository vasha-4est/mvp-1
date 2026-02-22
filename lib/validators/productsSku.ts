export type SkuType = "single" | "set";

export type CatalogSku = {
  sku_id: string;
  sku_name: string;
  sku_type: SkuType;
  sub_category: string | null;
  active: 0 | 1;
};

export type ProductsSkuSchemaError = {
  code: "INVALID_PRODUCTS_SKU_SCHEMA";
  message: string;
  details: {
    missing_columns: string[];
    required_columns: string[];
    table: "products_sku";
    db: "OPS_DB";
  };
};

const REQUIRED_COLUMNS = ["sku_id", "sku_name", "sku_type", "sub_category", "active"] as const;

function normalizeHeader(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSkuType(value: unknown): SkuType | null {
  const normalized = normalizeString(value).toLowerCase();
  if (normalized === "single" || normalized === "set") {
    return normalized;
  }
  return null;
}

function normalizeSubCategory(value: unknown): string | null {
  if (value === null || typeof value === "undefined") {
    return null;
  }

  const normalized = normalizeString(value);
  return normalized.length > 0 ? normalized : null;
}

function normalizeActive(value: unknown): 0 | 1 | null {
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  if (typeof value === "number") {
    if (value === 1) return 1;
    if (value === 0) return 0;
    return null;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "1" || normalized === "true") return 1;
    if (normalized === "0" || normalized === "false") return 0;
    return null;
  }

  return null;
}

export function validateProductsSkuSchema(headers: unknown[]): ProductsSkuSchemaError | null {
  const seen = new Set(headers.map(normalizeHeader).filter(Boolean));
  const missingColumns = REQUIRED_COLUMNS.filter((column) => !seen.has(column));

  if (missingColumns.length === 0) {
    return null;
  }

  return {
    code: "INVALID_PRODUCTS_SKU_SCHEMA",
    message: "products_sku schema validation failed",
    details: {
      missing_columns: [...missingColumns],
      required_columns: [...REQUIRED_COLUMNS],
      table: "products_sku",
      db: "OPS_DB",
    },
  };
}

export function normalizeCatalogSku(raw: unknown): CatalogSku | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }

  const row = raw as Record<string, unknown>;
  const skuId = normalizeString(row.sku_id);
  const skuName = normalizeString(row.sku_name);
  const skuType = normalizeSkuType(row.sku_type);
  const active = normalizeActive(row.active);

  if (!skuId || !skuName || !skuType || active === null) {
    return null;
  }

  return {
    sku_id: skuId,
    sku_name: skuName,
    sku_type: skuType,
    sub_category: normalizeSubCategory(row.sub_category),
    active,
  };
}

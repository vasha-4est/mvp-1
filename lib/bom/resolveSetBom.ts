import { parseErrorPayload, type ParsedGasError } from "@/lib/api/gasError";
import { callGas } from "@/lib/integrations/gasClient";

type GasBomRow = {
  set_sku?: unknown;
  component_sku?: unknown;
  qty?: unknown;
};

type GasSkuRow = {
  sku?: unknown;
  sku_type?: unknown;
  is_active?: unknown;
};

type BomReadResponse = {
  rows?: GasBomRow[];
  items?: GasBomRow[];
};

type CatalogBootstrapResponse = {
  sku?: GasSkuRow[];
};

export type BomComponent = {
  component_sku: string;
  qty: number;
};

type ResolveSetBomOk = {
  ok: true;
  set_sku: string;
  components: BomComponent[];
};

type ResolveSetBomError = {
  ok: false;
} & ParsedGasError;

export type ResolveSetBomResult = ResolveSetBomOk | ResolveSetBomError;

function normalizeSku(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeQty(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

function isActive(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value === 1;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "y";
  }

  return false;
}

export async function resolveSetBom(setSkuInput: string, requestId: string): Promise<ResolveSetBomResult> {
  const setSku = normalizeSku(setSkuInput);
  if (!setSku) {
    return { ok: false, error: "Invalid set_sku", code: "VALIDATION_ERROR" };
  }

  const [bomResponse, catalogResponse] = await Promise.all([
    callGas<BomReadResponse>("sku_bom_read", { set_sku: setSku }, requestId),
    callGas<CatalogBootstrapResponse>("catalog.bootstrap", {}, requestId),
  ]);

  if (!bomResponse.ok || !bomResponse.data) {
    return { ok: false, ...parseErrorPayload((bomResponse as { error?: unknown }).error) };
  }

  if (!catalogResponse.ok || !catalogResponse.data) {
    return { ok: false, ...parseErrorPayload((catalogResponse as { error?: unknown }).error) };
  }

  const skuRows = Array.isArray(catalogResponse.data.sku) ? catalogResponse.data.sku : [];
  const skuByCode = new Map<string, GasSkuRow>();

  for (const row of skuRows) {
    const sku = normalizeSku(row.sku);
    if (sku) {
      skuByCode.set(sku, row);
    }
  }

  const setSkuRow = skuByCode.get(setSku);
  if (!setSkuRow || String(setSkuRow.sku_type || "").trim().toLowerCase() !== "set") {
    return { ok: false, error: "Set SKU not found", code: "NOT_FOUND" };
  }

  const rows = Array.isArray(bomResponse.data.rows)
    ? bomResponse.data.rows
    : Array.isArray(bomResponse.data.items)
      ? bomResponse.data.items
      : [];

  const filteredRows = rows.filter((row) => normalizeSku(row.set_sku) === setSku);
  if (filteredRows.length === 0) {
    return { ok: false, error: "Set SKU not found", code: "NOT_FOUND" };
  }

  const componentQty = new Map<string, number>();

  for (const row of filteredRows) {
    const componentSku = normalizeSku(row.component_sku);
    const qty = normalizeQty(row.qty);
    if (!componentSku || qty === null) {
      return { ok: false, error: "Invalid sku_bom row", code: "VALIDATION_ERROR" };
    }

    const skuRow = skuByCode.get(componentSku);
    const skuType = String(skuRow?.sku_type || "").trim().toLowerCase();
    if (!skuRow || skuType !== "single" || !isActive(skuRow.is_active)) {
      return {
        ok: false,
        error: `Invalid component SKU: ${componentSku}`,
        code: "VALIDATION_ERROR",
      };
    }

    componentQty.set(componentSku, (componentQty.get(componentSku) || 0) + qty);
  }

  const components = Array.from(componentQty.entries())
    .map(([component_sku, qty]) => ({ component_sku, qty }))
    .sort((a, b) => a.component_sku.localeCompare(b.component_sku));

  return {
    ok: true,
    set_sku: setSku,
    components,
  };
}

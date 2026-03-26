import { NextResponse } from "next/server";

import { withDevFastTimeout } from "@/lib/dev/localReadFallbacks";
import { statusForErrorCode } from "@/lib/api/gasError";
import { getLocalProductionPlanFallback, shouldUseLocalProductionFallback } from "@/lib/dev/productionLaunchLocal";
import { buildProductionPlanPayload, getProductionPlan, type InventoryBalanceItem, type ShipmentPlanRow } from "@/lib/productionPlan/getProductionPlan";
import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { requireAnyRole } from "@/lib/server/guards";

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: {
      [REQUEST_ID_HEADER]: requestId,
    },
  });
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function num(value: unknown): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

async function fallbackViaInternalRoutes(request: Request, requestId: string) {
  const cookie = request.headers.get("cookie") ?? "";
  const headers = cookie ? { cookie } : {};

  const shipmentResponse = await fetch(new URL("/api/shipment-plan/import/latest", request.url), {
    headers: {
      ...headers,
      [REQUEST_ID_HEADER]: `${requestId}:fallback-shipment`,
    },
    cache: "no-store",
  });

  const shipmentPayload = (await shipmentResponse.json().catch(() => null)) as
    | { import_batch_id?: unknown; rows?: unknown; error?: unknown; code?: unknown }
    | null;

  if (!shipmentResponse.ok) {
    return {
      ok: false as const,
      status: shipmentResponse.status,
      body: {
        ok: false,
        error: str(shipmentPayload?.error) || "Failed to read shipment plan import",
        code: str(shipmentPayload?.code) || "BAD_GATEWAY",
      },
    };
  }

  const inventoryResponse = await fetch(new URL("/api/inventory/balances", request.url), {
    headers: {
      ...headers,
      [REQUEST_ID_HEADER]: `${requestId}:fallback-inventory`,
    },
    cache: "no-store",
  });

  const inventoryPayload = (await inventoryResponse.json().catch(() => null)) as
    | { items?: unknown; error?: unknown; code?: unknown }
    | null;

  if (!inventoryResponse.ok) {
    return {
      ok: false as const,
      status: inventoryResponse.status,
      body: {
        ok: false,
        error: str(inventoryPayload?.error) || "Failed to read inventory balances",
        code: str(inventoryPayload?.code) || "BAD_GATEWAY",
      },
    };
  }

  const shipmentRowsRaw = Array.isArray(shipmentPayload?.rows) ? shipmentPayload.rows : [];
  const inventoryItemsRaw = Array.isArray(inventoryPayload?.items) ? inventoryPayload.items : [];

  const shipmentRows: ShipmentPlanRow[] = shipmentRowsRaw.map((row) => {
    const item = row as Record<string, unknown>;
    return {
      shipment_id: str(item.shipment_id),
      deadline_at: str(item.deadline_at) || null,
      products_sku: str(item.products_sku),
      planned_qty: num(item.planned_qty),
    };
  });

  const inventoryItems: InventoryBalanceItem[] = inventoryItemsRaw.map((row) => {
    const item = row as Record<string, unknown>;
    return {
      sku_id: str(item.sku_id),
      available_qty: num(item.available_qty),
    };
  });

  return {
    ok: true as const,
    data: buildProductionPlanPayload({
      generatedAt: new Date(),
      importBatchId: str(shipmentPayload?.import_batch_id) || null,
      planRows: shipmentRows,
      inventoryItems,
    }),
  };
}

export async function GET(request: Request) {
  const auth = requireAnyRole(request, ["OWNER", "COO"]);
  if (auth.ok === false) {
    return auth.response;
  }

  const result = await withDevFastTimeout(getProductionPlan(auth.requestId), {
    ok: true as const,
    data: getLocalProductionPlanFallback(),
  });

  if (result.ok === false) {
    const fallback = await withDevFastTimeout(fallbackViaInternalRoutes(request, auth.requestId), {
      ok: true as const,
      data: getLocalProductionPlanFallback(),
    });
    if (fallback.ok) {
      return json(auth.requestId, 200, fallback.data);
    }

    if (shouldUseLocalProductionFallback()) {
      return json(auth.requestId, 200, getLocalProductionPlanFallback());
    }

    return json(auth.requestId, fallback.status ?? statusForErrorCode(result.code), {
      ok: false,
      error: fallback.body.error || result.error,
      code: fallback.body.code || result.code,
      ...(result.details ? { details: result.details } : {}),
    });
  }

  return json(auth.requestId, 200, result.data);
}

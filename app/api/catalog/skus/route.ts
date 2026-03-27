// Catalog API route entrypoint for App Router deployments rooted at app/.
import { NextResponse } from "next/server";

import { statusForErrorCode } from "@/lib/api/gasError";
import { withDevFastTimeout } from "@/lib/dev/localReadFallbacks";
import { listCatalogSkus } from "@/lib/catalog/listSkus";
import { listLocalCatalog, shouldUseLocalPickingFallback } from "@/lib/dev/pickingLocal";
import type { SkuType } from "@/lib/validators/productsSku";

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: {
      "x-request-id": requestId,
      "Cache-Control": "no-store",
    },
  });
}

function parseSkuType(value: string | null): { value?: SkuType; error?: string } {
  if (!value) {
    return {};
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "single" || normalized === "set") {
    return { value: normalized };
  }

  return { error: "Invalid 'type' value (expected 'single' or 'set')" };
}

function parseActive(value: string | null): { value?: 0 | 1; error?: string } {
  if (!value || value.trim().length === 0) {
    return { value: 1 };
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true") {
    return { value: 1 };
  }

  if (normalized === "0" || normalized === "false") {
    return { value: 0 };
  }

  return { error: "Invalid 'active' value (expected 1 or 0)" };
}

export async function GET(request: Request) {
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();

  try {
    const { searchParams } = new URL(request.url);

    const typeResult = parseSkuType(searchParams.get("type"));
    if (typeResult.error) {
      return json(requestId, 400, { ok: false, error: typeResult.error, code: "BAD_REQUEST" });
    }

    const activeResult = parseActive(searchParams.get("active"));
    if (activeResult.error || typeof activeResult.value === "undefined") {
      return json(requestId, 400, {
        ok: false,
        error: activeResult.error ?? "Invalid 'active' value",
        code: "BAD_REQUEST",
      });
    }

    const fallbackItems = listLocalCatalog(activeResult.value);
    const result = await withDevFastTimeout(listCatalogSkus(requestId, {
      type: typeResult.value,
      active: activeResult.value,
    }), {
      ok: true as const,
      items: fallbackItems,
    });

    if (result.ok === false) {
      if (shouldUseLocalPickingFallback()) {
        return json(requestId, 200, {
          ok: true,
          items: fallbackItems,
          fallback: "local",
        });
      }

      return json(requestId, statusForErrorCode(result.code), {
        ok: false,
        error: result.error,
        code: result.code,
        ...(result.details ? { details: result.details } : {}),
      });
    }

    if (shouldUseLocalPickingFallback() && result.items.length === 0 && fallbackItems.length > 0) {
      return json(requestId, 200, {
        ok: true,
        items: fallbackItems,
        fallback: "local",
      });
    }

    return json(requestId, 200, {
      ok: true,
      items: result.items.map((item) => ({
        sku_id: item.sku_id,
        sku_name: item.sku_name,
        sku_type: item.sku_type,
        sub_category: item.sub_category,
        photo_url: item.photo_url ?? null,
      })),
    });
  } catch {
    return json(requestId, 502, {
      ok: false,
      error: "Bad gateway",
      code: "BAD_GATEWAY",
    });
  }
}

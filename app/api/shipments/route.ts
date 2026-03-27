import { NextResponse } from "next/server";

import { withDevFastTimeout } from "@/lib/dev/localReadFallbacks";
import { listLocalShipments, shouldUseLocalPickingFallback } from "@/lib/dev/pickingLocal";
import { listShipments } from "@/lib/shipments/readShipments";
import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { requireAnyRole } from "@/lib/server/guards";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: {
      [REQUEST_ID_HEADER]: requestId,
    },
  });
}

function statusForShipmentsCode(code: string): number {
  if (code === "NOT_FOUND") return 404;
  if (code === "BAD_REQUEST" || code === "VALIDATION_ERROR") return 400;
  if (code === "SHEET_MISSING") return 500;
  return 502;
}

function parseLimit(request: Request): { ok: true; limit: number } | { ok: false; error: string; code: "BAD_REQUEST" } {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("limit");

  if (!raw) {
    return { ok: true, limit: DEFAULT_LIMIT };
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return { ok: false, error: "Query param 'limit' must be a positive integer", code: "BAD_REQUEST" };
  }

  return { ok: true, limit: Math.min(parsed, MAX_LIMIT) };
}

export async function GET(request: Request) {
  const auth = requireAnyRole(request, ["OWNER", "COO"]);
  if (auth.ok === false) {
    return auth.response;
  }

  const limitResult = parseLimit(request);
  if (limitResult.ok === false) {
    return json(auth.requestId, 400, {
      ok: false,
      error: limitResult.error,
      code: limitResult.code,
    });
  }

  const fallbackItems = listLocalShipments(limitResult.limit);
  const result = await withDevFastTimeout(listShipments(auth.requestId, limitResult.limit), {
    ok: true as const,
    data: fallbackItems,
  });

  if (result.ok === false) {
    if (shouldUseLocalPickingFallback()) {
      return json(auth.requestId, 200, {
        ok: true,
        items: fallbackItems,
        fallback: "local",
      });
    }

    return json(auth.requestId, statusForShipmentsCode(result.code), {
      ok: false,
      error: result.error,
      code: result.code,
      ...(result.details ? { details: result.details } : {}),
    });
  }

  if (shouldUseLocalPickingFallback() && result.data.length === 0 && fallbackItems.length > 0) {
    return json(auth.requestId, 200, {
      ok: true,
      items: fallbackItems,
      fallback: "local",
    });
  }

  return json(auth.requestId, 200, {
    ok: true,
    items: result.data,
  });
}

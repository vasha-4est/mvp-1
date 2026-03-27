import { NextResponse } from "next/server";

import { withDevFastTimeout } from "@/lib/dev/localReadFallbacks";
import { listLocalPickingLists, shouldUseLocalPickingFallback } from "@/lib/dev/pickingLocal";
import { statusForErrorCode } from "@/lib/api/gasError";
import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { readPickingLists } from "@/lib/picking/readPickingSheets";
import { requireAnyRole } from "@/lib/server/guards";

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: {
      [REQUEST_ID_HEADER]: requestId,
    },
  });
}

function statusForPickingError(code: string): number {
  if (code === "SHEET_MISSING") return 500;
  return statusForErrorCode(code);
}

export async function GET(request: Request) {
  const auth = requireAnyRole(request, ["OWNER", "COO"]);
  if (auth.ok === false) {
    return auth.response;
  }

  const requestId = auth.requestId;
  const url = new URL(request.url);
  const rawLimit = url.searchParams.get("limit");
  const parsedLimit = rawLimit ? Number.parseInt(rawLimit, 10) : 50;
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 50;

  const fallbackItems = await listLocalPickingLists(limit);
  const result = await withDevFastTimeout(readPickingLists(requestId, limit), {
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

    return json(requestId, statusForPickingError(result.code), {
      ok: false,
      code: result.code,
      error: result.error,
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
    items: result.items,
  });
}

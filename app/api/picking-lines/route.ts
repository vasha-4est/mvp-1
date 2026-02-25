import { NextResponse } from "next/server";

import { statusForErrorCode } from "@/lib/api/gasError";
import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { readPickingLines } from "@/lib/picking/readPickingSheets";
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
  if (auth.ok === false) return auth.response;

  const requestId = auth.requestId;
  const url = new URL(request.url);
  const pickingListId = url.searchParams.get("picking_list_id")?.trim() ?? "";

  const rawLimit = url.searchParams.get("limit");
  const parsedLimit = rawLimit ? Number.parseInt(rawLimit, 10) : 50;
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 50;

  const result = await readPickingLines(requestId, pickingListId, limit);
  if (result.ok === false) {
    return json(requestId, statusForPickingError(result.code), {
      ok: false,
      code: result.code,
      error: result.error,
      ...(result.details ? { details: result.details } : {}),
    });
  }

  return json(requestId, 200, {
    ok: true,
    items: result.items,
  });
}

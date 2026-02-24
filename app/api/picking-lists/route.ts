import { NextResponse } from "next/server";

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

function toStatus(code: string): number {
  if (code === "SHEET_MISSING") return 500;
  if (code === "UNAUTHORIZED") return 401;
  return 502;
}

export async function GET(request: Request) {
  const auth = requireAnyRole(request, ["OWNER", "COO"]);
  if (auth.ok === false) {
    return auth.response;
  }

  const requestId = auth.requestId;
  const url = new URL(request.url);
  const rawLimit = url.searchParams.get("limit");
  const parsed = rawLimit ? Number.parseInt(rawLimit, 10) : 50;
  const limit = Number.isFinite(parsed) && parsed > 0 ? parsed : 50;

  const result = await readPickingLists(requestId);
  if (result.ok === false) {
    return json(requestId, toStatus(result.code), {
      ok: false,
      code: result.code,
      error: result.error,
      ...(result.details ? { details: result.details } : {}),
    });
  }

  return json(requestId, 200, {
    ok: true,
    items: result.items.slice(0, limit),
  });
}

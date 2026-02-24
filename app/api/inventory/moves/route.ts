import { NextResponse } from "next/server";

import { listInventoryMoves } from "@/lib/inventory/listInventoryMoves";
import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { requireRole } from "@/lib/server/guards";

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: requestId } });
}

export async function GET(request: Request) {
  const auth = requireRole(request, ["OWNER", "COO"]);
  if (auth.ok === false) return auth.response;

  const url = new URL(request.url);
  const skuId = (url.searchParams.get("sku_id") ?? "").trim();
  const parsedLimit = Number(url.searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(200, Math.floor(parsedLimit))) : 50;

  const result = await listInventoryMoves(auth.requestId, { limit, sku_id: skuId });
  if (result.ok === false) {
    return json(auth.requestId, 502, { ok: false, code: "BAD_GATEWAY", error: result.error || "Bad gateway" });
  }

  return json(auth.requestId, 200, { ok: true, items: result.items });
}

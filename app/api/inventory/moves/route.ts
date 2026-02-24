import { NextResponse } from "next/server";

import { parseErrorPayload } from "@/lib/api/gasError";
import { callGas } from "@/lib/integrations/gasClient";
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
  const limitRaw = url.searchParams.get("limit") ?? "10";
  const parsedLimit = Number(limitRaw);
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.floor(parsedLimit) : 10;

  const gas = await callGas<{ items?: unknown }>("inventory.moves.list", { sku_id: skuId, limit }, auth.requestId);
  if (!gas.ok || !gas.data) {
    const parsed = parseErrorPayload((gas as { error?: unknown }).error);
    if (parsed.code === "FLAG_DISABLED") return json(auth.requestId, 503, { ok: false, code: "FLAG_DISABLED" });
    return json(auth.requestId, 502, { ok: false, code: parsed.code, error: parsed.error });
  }

  return json(auth.requestId, 200, { ok: true, items: Array.isArray(gas.data.items) ? gas.data.items : [] });
}

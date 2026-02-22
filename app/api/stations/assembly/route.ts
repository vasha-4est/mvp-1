import { NextResponse } from "next/server";

import { callGas } from "@/lib/integrations/gasClient";
import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { requireRole } from "@/lib/server/guards";
import { filterAssemblyBatchesByCode, normalizeAssemblyBatches } from "@/lib/stations/assembly/normalize";

type BatchListResponse = {
  items?: unknown;
};

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: {
      [REQUEST_ID_HEADER]: requestId,
    },
  });
}

export async function GET(request: Request) {
  const auth = requireRole(request, ["OWNER", "COO"]);

  if (auth.ok === false) {
    return auth.response;
  }

  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") ?? "";

    const response = await callGas<BatchListResponse>("batch_list", {}, auth.requestId);
    if (!response.ok || !response.data) {
      return json(auth.requestId, 502, {
        ok: false,
        error: "Failed to load assembly source data",
      });
    }

    const root = response.data;
    const rawItems = Array.isArray(root.items)
      ? root.items
      : Array.isArray(root)
      ? root
      : [];

    const normalized = normalizeAssemblyBatches(rawItems);
    const filtered = filterAssemblyBatchesByCode(normalized, q);

    return json(auth.requestId, 200, {
      ok: true,
      data: filtered,
    });
  } catch {
    return json(auth.requestId, 500, {
      ok: false,
      error: "Internal server error",
      code: "INTERNAL_ERROR",
    });
  }
}

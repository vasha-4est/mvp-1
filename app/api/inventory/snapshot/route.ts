import { NextResponse } from "next/server";

import { getInventorySnapshot } from "@/lib/inventory/getInventorySnapshot";
import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { requireRole } from "@/lib/server/guards";

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
    const snapshot = await getInventorySnapshot(auth.requestId);

    if (snapshot.ok === false) {
      return json(auth.requestId, 502, {
        ok: false,
        error: snapshot.error,
      });
    }

    return json(auth.requestId, 200, {
      ok: true,
      items: snapshot.items,
    });
  } catch {
    return json(auth.requestId, 500, {
      ok: false,
      error: "Internal server error",
      code: "INTERNAL_ERROR",
    });
  }
}

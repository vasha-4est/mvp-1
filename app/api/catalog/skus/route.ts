import { NextResponse } from "next/server";

import { CatalogFetchError, listCatalogSkus } from "@/lib/catalog/listSkus";
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
    const skus = await listCatalogSkus(auth.requestId);

    return json(auth.requestId, 200, {
      ok: true,
      data: skus,
    });
  } catch (error) {
    if (error instanceof CatalogFetchError) {
      return json(auth.requestId, 502, {
        ok: false,
        error: "Failed to load catalog SKUs",
        code: "CATALOG_FETCH_FAILED",
      });
    }

    return json(auth.requestId, 500, {
      ok: false,
      error: "Internal server error",
      code: "INTERNAL_ERROR",
    });
  }
}

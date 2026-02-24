import { NextResponse } from "next/server";

import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { requireRole } from "@/lib/server/guards";
import { normalizeAssemblySetSkus } from "@/lib/stations/assembly/normalize";

type CatalogSkuResponse = {
  data?: unknown;
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

  const catalogUrl = new URL("/api/catalog/skus", request.url);

  let catalogResponse: Response;
  try {
    catalogResponse = await fetch(catalogUrl, {
      method: "GET",
      cache: "no-store",
      headers: {
        [REQUEST_ID_HEADER]: auth.requestId,
        cookie: request.headers.get("cookie") ?? "",
      },
    });
  } catch {
    return json(auth.requestId, 502, {
      ok: false,
      error: "Failed to load catalog SKUs",
      code: "CATALOG_FETCH_FAILED",
    });
  }

  if (!catalogResponse.ok) {
    return json(auth.requestId, 502, {
      ok: false,
      error: "Failed to load catalog SKUs",
      code: "CATALOG_FETCH_FAILED",
    });
  }

  let payload: CatalogSkuResponse;
  try {
    payload = (await catalogResponse.json()) as CatalogSkuResponse;
  } catch {
    return json(auth.requestId, 502, {
      ok: false,
      error: "Failed to parse catalog response",
      code: "CATALOG_PARSE_FAILED",
    });
  }

  const rows = Array.isArray(payload.data) ? payload.data : Array.isArray(payload.items) ? payload.items : [];

  return json(auth.requestId, 200, {
    ok: true,
    data: normalizeAssemblySetSkus(rows),
  });
}

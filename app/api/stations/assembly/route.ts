import { NextResponse } from "next/server";

import { calculateAvailability, type AvailabilityBomComponent, type AvailabilityInventoryItem } from "@/lib/assembly/calculateAvailability";
import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { requireRole } from "@/lib/server/guards";
import { normalizeAssemblySetSkus } from "@/lib/stations/assembly/normalize";

type CatalogSkuResponse = {
  data?: unknown;
  items?: unknown;
};

type BomResponse = {
  components?: unknown;
  data?: unknown;
};

type InventorySnapshotResponse = {
  items?: unknown;
};

type AssemblyAvailabilityRow = {
  sku: string;
  sku_name: string;
  availability: number;
  bottleneck_component?: string;
  component_shortage: boolean;
};

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: {
      [REQUEST_ID_HEADER]: requestId,
    },
  });
}

function parseBomComponents(payload: BomResponse): AvailabilityBomComponent[] {
  const rawComponents = Array.isArray(payload.components)
    ? payload.components
    : payload.data && typeof payload.data === "object" && Array.isArray((payload.data as { components?: unknown }).components)
    ? ((payload.data as { components?: unknown[] }).components ?? [])
    : payload.data && typeof payload.data === "object" && Array.isArray((payload.data as { items?: unknown }).items)
    ? ((payload.data as { items?: unknown[] }).items ?? [])
    : [];

  return rawComponents
    .map((component): AvailabilityBomComponent | null => {
      if (!component || typeof component !== "object" || Array.isArray(component)) {
        return null;
      }

      const row = component as Record<string, unknown>;
      const component_sku = typeof row.component_sku === "string" ? row.component_sku.trim() : "";
      const qty = typeof row.qty === "number" ? row.qty : Number(String(row.qty ?? ""));

      if (!component_sku || !Number.isFinite(qty) || qty <= 0) {
        return null;
      }

      return {
        component_sku,
        qty,
      };
    })
    .filter((component): component is AvailabilityBomComponent => Boolean(component));
}

function parseInventoryItems(payload: InventorySnapshotResponse): AvailabilityInventoryItem[] {
  if (!Array.isArray(payload.items)) {
    return [];
  }

  return payload.items
    .map((item): AvailabilityInventoryItem | null => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      const row = item as Record<string, unknown>;
      const sku_id = typeof row.sku_id === "string" ? row.sku_id.trim() : "";
      const total_available =
        typeof row.total_available === "number" ? row.total_available : Number(String(row.total_available ?? ""));

      if (!sku_id || !Number.isFinite(total_available)) {
        return null;
      }

      return {
        sku_id,
        total_available,
      };
    })
    .filter((item): item is AvailabilityInventoryItem => Boolean(item));
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
  const setSkus = normalizeAssemblySetSkus(rows);

  const inventoryUrl = new URL("/api/inventory/snapshot", request.url);
  let inventorySnapshot: AvailabilityInventoryItem[] = [];

  try {
    const inventoryResponse = await fetch(inventoryUrl, {
      method: "GET",
      cache: "no-store",
      headers: {
        [REQUEST_ID_HEADER]: auth.requestId,
        cookie: request.headers.get("cookie") ?? "",
      },
    });

    if (inventoryResponse.ok) {
      const inventoryPayload = (await inventoryResponse.json()) as InventorySnapshotResponse;
      inventorySnapshot = parseInventoryItems(inventoryPayload);
    }
  } catch {
    inventorySnapshot = [];
  }

  const data: AssemblyAvailabilityRow[] = await Promise.all(
    setSkus.map(async (row) => {
      const bomUrl = new URL(`/api/bom/${encodeURIComponent(row.sku)}`, request.url);

      try {
        const bomResponse = await fetch(bomUrl, {
          method: "GET",
          cache: "no-store",
          headers: {
            [REQUEST_ID_HEADER]: auth.requestId,
            cookie: request.headers.get("cookie") ?? "",
          },
        });

        if (!bomResponse.ok) {
          return {
            ...row,
            availability: 0,
            component_shortage: false,
          };
        }

        const bomPayload = (await bomResponse.json()) as BomResponse;
        const components = parseBomComponents(bomPayload);
        const availability = calculateAvailability(components, inventorySnapshot);

        return {
          ...row,
          availability: availability.availability,
          ...(availability.bottleneck_component ? { bottleneck_component: availability.bottleneck_component } : {}),
          component_shortage: availability.component_shortage,
        };
      } catch {
        return {
          ...row,
          availability: 0,
          component_shortage: false,
        };
      }
    })
  );

  return json(auth.requestId, 200, {
    ok: true,
    data,
  });
}

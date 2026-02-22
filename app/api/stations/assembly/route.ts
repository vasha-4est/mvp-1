import { NextResponse } from "next/server";

import { callGas } from "@/lib/integrations/gasClient";
import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { requireRole } from "@/lib/server/guards";
import {
  filterAssemblySetSkus,
  normalizeAssemblyBomComponents,
  normalizeAssemblySetSkus,
  type AssemblyBomComponent,
  type AssemblySetSku,
} from "@/lib/stations/assembly/normalize";

type SkuListResponse = {
  items?: unknown;
};

type BomResponse = {
  items?: unknown;
  components?: unknown;
};

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: {
      [REQUEST_ID_HEADER]: requestId,
    },
  });
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

async function resolveBomForSet(sku: string, requestId: string): Promise<AssemblyBomComponent[]> {
  const candidates = ["bom_get", "bom_fetch", "bom_resolve"];

  for (const action of candidates) {
    const response = await callGas<BomResponse>(action, { sku }, requestId);
    if (!response.ok || !response.data) {
      continue;
    }

    const root = response.data;
    const items = asArray(root.components).length > 0 ? asArray(root.components) : asArray(root.items);
    const normalized = normalizeAssemblyBomComponents(items);

    if (normalized.length > 0 || asArray(root.components).length > 0 || asArray(root.items).length > 0) {
      return normalized;
    }
  }

  return [];
}

export async function GET(request: Request) {
  const auth = requireRole(request, ["OWNER", "COO"]);

  if (auth.ok === false) {
    return auth.response;
  }

  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") ?? "";

    const response = await callGas<SkuListResponse>("sku_list", {}, auth.requestId);
    if (!response.ok || !response.data) {
      return json(auth.requestId, 502, {
        ok: false,
        error: "Failed to load assembly SKU data",
      });
    }

    const root = response.data;
    const rawItems = Array.isArray(root.items) ? root.items : Array.isArray(root) ? root : [];
    const setSkus = normalizeAssemblySetSkus(rawItems);

    const withBom: AssemblySetSku[] = await Promise.all(
      setSkus.map(async (setSku) => ({
        ...setSku,
        components: await resolveBomForSet(setSku.sku, auth.requestId),
      }))
    );

    const filtered = filterAssemblySetSkus(withBom, q);

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

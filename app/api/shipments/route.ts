import { NextResponse } from "next/server";

import { withDevFastTimeout } from "@/lib/dev/localReadFallbacks";
import { listLocalShipments, shouldUseLocalPickingFallback } from "@/lib/dev/pickingLocal";
import { listShipments } from "@/lib/shipments/readShipments";
import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { requireAnyRole } from "@/lib/server/guards";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const DEFAULT_PAGE_SIZE = 10;

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: {
      [REQUEST_ID_HEADER]: requestId,
    },
  });
}

function statusForShipmentsCode(code: string): number {
  if (code === "NOT_FOUND") return 404;
  if (code === "BAD_REQUEST" || code === "VALIDATION_ERROR") return 400;
  if (code === "SHEET_MISSING") return 500;
  return 502;
}

function parseLimit(request: Request): { ok: true; limit: number } | { ok: false; error: string; code: "BAD_REQUEST" } {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("limit");

  if (!raw) {
    return { ok: true, limit: DEFAULT_LIMIT };
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return { ok: false, error: "Query param 'limit' must be a positive integer", code: "BAD_REQUEST" };
  }

  return { ok: true, limit: Math.min(parsed, MAX_LIMIT) };
}

function parsePositiveInt(value: string | null, fallback: number, max: number): number {
  const parsed = Number(value ?? "");
  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, max);
}

function normalizeStatusFilter(value: string | null): string | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized && normalized !== "all" ? normalized : null;
}

export async function GET(request: Request) {
  const auth = requireAnyRole(request, ["OWNER", "COO"]);
  if (auth.ok === false) {
    return auth.response;
  }

  const limitResult = parseLimit(request);
  if (limitResult.ok === false) {
    return json(auth.requestId, 400, {
      ok: false,
      error: limitResult.error,
      code: limitResult.code,
    });
  }

  const url = new URL(request.url);
  const page = parsePositiveInt(url.searchParams.get("page"), 1, 10_000);
  const pageSize = parsePositiveInt(url.searchParams.get("pageSize"), DEFAULT_PAGE_SIZE, MAX_LIMIT);
  const statusFilter = normalizeStatusFilter(url.searchParams.get("status"));
  const fetchLimit = Math.max(limitResult.limit, MAX_LIMIT);

  const fallbackItems = listLocalShipments(fetchLimit);
  const result = await withDevFastTimeout(listShipments(auth.requestId, fetchLimit), {
    ok: true as const,
    data: fallbackItems,
  });

  if (result.ok === false) {
    if (shouldUseLocalPickingFallback()) {
      const filteredFallbackItems = fallbackItems.filter((item) => {
        if (!statusFilter) return true;
        return (item.status ?? "").trim().toLowerCase() === statusFilter;
      });
      const totalItems = filteredFallbackItems.length;
      const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
      const safePage = Math.min(page, totalPages);
      const start = (safePage - 1) * pageSize;
      return json(auth.requestId, 200, {
        ok: true,
        items: filteredFallbackItems.slice(start, start + pageSize),
        page: safePage,
        pageSize,
        totalItems,
        totalPages,
        statusFilter,
        fallback: "local",
      });
    }

    return json(auth.requestId, statusForShipmentsCode(result.code), {
      ok: false,
      error: result.error,
      code: result.code,
      ...(result.details ? { details: result.details } : {}),
    });
  }

  const filteredItems = result.data.filter((item) => {
    if (!statusFilter) return true;
    return (item.status ?? "").trim().toLowerCase() === statusFilter;
  });
  const totalItems = filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const items = filteredItems.slice(start, start + pageSize);

  if (shouldUseLocalPickingFallback() && result.data.length === 0 && fallbackItems.length > 0) {
    return json(auth.requestId, 200, {
      ok: true,
      items: fallbackItems.slice(0, pageSize),
      page: 1,
      pageSize,
      totalItems: fallbackItems.length,
      totalPages: Math.max(1, Math.ceil(fallbackItems.length / pageSize)),
      statusFilter,
      fallback: "local",
    });
  }

  return json(auth.requestId, 200, {
    ok: true,
    items,
    page: safePage,
    pageSize,
    totalItems,
    totalPages,
    statusFilter,
  });
}

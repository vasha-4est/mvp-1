import { NextResponse } from "next/server";

import { withDevFastTimeout } from "@/lib/dev/localReadFallbacks";
import { listLocalPickingLists, shouldUseLocalPickingFallback } from "@/lib/dev/pickingLocal";
import { statusForErrorCode } from "@/lib/api/gasError";
import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { readPickingLists } from "@/lib/picking/readPickingSheets";
import { requireAnyRole } from "@/lib/server/guards";

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 200;
const FETCH_LIMIT = 200;

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: {
      [REQUEST_ID_HEADER]: requestId,
    },
  });
}

function statusForPickingError(code: string): number {
  if (code === "SHEET_MISSING") return 500;
  return statusForErrorCode(code);
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

  const requestId = auth.requestId;
  const url = new URL(request.url);
  const page = parsePositiveInt(url.searchParams.get("page"), 1, 10_000);
  const pageSize = parsePositiveInt(url.searchParams.get("pageSize"), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const statusFilter = normalizeStatusFilter(url.searchParams.get("status"));

  const fallbackItems = await listLocalPickingLists(FETCH_LIMIT);
  const result = await withDevFastTimeout(readPickingLists(requestId, FETCH_LIMIT), {
    ok: true as const,
    items: fallbackItems,
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
      return json(requestId, 200, {
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

    return json(requestId, statusForPickingError(result.code), {
      ok: false,
      code: result.code,
      error: result.error,
      ...(result.details ? { details: result.details } : {}),
    });
  }

  const filteredItems = result.items.filter((item) => {
    if (!statusFilter) return true;
    return (item.status ?? "").trim().toLowerCase() === statusFilter;
  });
  const totalItems = filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const items = filteredItems.slice(start, start + pageSize);

  if (shouldUseLocalPickingFallback() && result.items.length === 0 && fallbackItems.length > 0) {
    const totalFallbackPages = Math.max(1, Math.ceil(fallbackItems.length / pageSize));
    return json(requestId, 200, {
      ok: true,
      items: fallbackItems.slice(0, pageSize),
      page: 1,
      pageSize,
      totalItems: fallbackItems.length,
      totalPages: totalFallbackPages,
      statusFilter,
      fallback: "local",
    });
  }

  return json(requestId, 200, {
    ok: true,
    items,
    page: safePage,
    pageSize,
    totalItems,
    totalPages,
    statusFilter,
  });
}

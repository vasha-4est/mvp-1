import { NextResponse } from "next/server";

import { statusForErrorCode } from "@/lib/api/gasError";
import { getKanbanCards } from "@/lib/kanban/getKanbanCards";
import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { requireOwner } from "@/lib/server/guards";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: {
      [REQUEST_ID_HEADER]: requestId,
    },
  });
}

function parseLimit(raw: string | null): { ok: true; value: number } | { ok: false; error: string; code: "VALIDATION_ERROR" } {
  if (!raw || !raw.trim()) return { ok: true, value: DEFAULT_LIMIT };

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      error: `Query param 'limit' must be an integer between 1 and ${MAX_LIMIT}`,
    };
  }

  return { ok: true, value: parsed };
}

function parseStr(raw: string | null): string | undefined {
  const value = (raw ?? "").trim();
  return value ? value : undefined;
}

export async function GET(request: Request) {
  const auth = requireOwner(request);
  if (auth.ok === false) {
    return auth.response;
  }

  const { searchParams } = new URL(request.url);
  const limitResult = parseLimit(searchParams.get("limit"));

  if (limitResult.ok === false) {
    return json(auth.requestId, 400, {
      ok: false,
      code: limitResult.code,
      error: limitResult.error,
    });
  }

  const result = await getKanbanCards(auth.requestId, {
    zone: parseStr(searchParams.get("zone")),
    station: parseStr(searchParams.get("station")),
    status: parseStr(searchParams.get("status")),
    limit: limitResult.value,
    cursor: parseStr(searchParams.get("cursor")) ?? null,
  });

  if (result.ok === false) {
    return json(auth.requestId, statusForErrorCode(result.code), {
      ok: false,
      code: result.code,
      error: result.error,
      ...(result.details ? { details: result.details } : {}),
    });
  }

  return json(auth.requestId, 200, result.data);
}

import { NextResponse } from "next/server";

import { getDeficitKpi } from "@/lib/kpi/readDeficit";
import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { requireAnyRole } from "@/lib/server/guards";

const DEFAULT_LIMIT_SHIPMENTS = 10;
const DEFAULT_LIMIT_PICKING = 50;
const MAX_LIMIT_SHIPMENTS = 200;
const MAX_LIMIT_PICKING = 500;

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: {
      [REQUEST_ID_HEADER]: requestId,
    },
  });
}

function parsePositiveInt(
  raw: string | null,
  fallback: number,
  max: number,
  paramName: string
): { ok: true; value: number } | { ok: false; error: string; code: "BAD_REQUEST" } {
  if (!raw) return { ok: true, value: fallback };

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return {
      ok: false,
      code: "BAD_REQUEST",
      error: `Query param '${paramName}' must be a positive integer`,
    };
  }

  return {
    ok: true,
    value: Math.min(parsed, max),
  };
}

function statusForErrorCode(code: string): number {
  if (code === "FLAG_DISABLED") return 400;
  if (code === "BAD_REQUEST" || code === "VALIDATION_ERROR") return 400;
  if (code === "NOT_FOUND") return 404;

  return 502;
}

export async function GET(request: Request) {
  const auth = requireAnyRole(request, ["OWNER", "COO"]);
  if (auth.ok === false) {
    return auth.response;
  }

  const { searchParams } = new URL(request.url);
  const shipmentsLimitResult = parsePositiveInt(
    searchParams.get("limit_shipments"),
    DEFAULT_LIMIT_SHIPMENTS,
    MAX_LIMIT_SHIPMENTS,
    "limit_shipments"
  );

  if (shipmentsLimitResult.ok === false) {
    return json(auth.requestId, 400, {
      ok: false,
      error: shipmentsLimitResult.error,
      code: shipmentsLimitResult.code,
    });
  }

  const pickingLimitResult = parsePositiveInt(
    searchParams.get("limit_picking"),
    DEFAULT_LIMIT_PICKING,
    MAX_LIMIT_PICKING,
    "limit_picking"
  );

  if (pickingLimitResult.ok === false) {
    return json(auth.requestId, 400, {
      ok: false,
      error: pickingLimitResult.error,
      code: pickingLimitResult.code,
    });
  }

  const result = await getDeficitKpi(auth.requestId, {
    limit_shipments: shipmentsLimitResult.value,
    limit_picking: pickingLimitResult.value,
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

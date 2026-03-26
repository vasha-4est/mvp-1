import { NextResponse } from "next/server";

import { getLocalLatestShipmentPlanBatchFallback, isDevFallbackEnabled, withDevFastTimeout } from "@/lib/dev/localReadFallbacks";
import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { readLatestStagedShipmentPlanBatch } from "@/lib/shipmentPlan/readLatestStagedBatch";
import { requireAnyRole } from "@/lib/server/guards";

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: {
      [REQUEST_ID_HEADER]: requestId,
    },
  });
}

function statusForCode(code: string): number {
  if (code === "UNAUTHORIZED") return 401;
  if (code === "FORBIDDEN") return 403;
  if (code === "NOT_FOUND") return 404;
  if (code === "BAD_REQUEST" || code === "VALIDATION_ERROR") return 400;
  if (code === "SHEET_MISSING") return 500;
  return 502;
}

export async function GET(request: Request) {
  const auth = requireAnyRole(request, ["OWNER", "COO"]);
  if (auth.ok === false) {
    return auth.response;
  }

  const result = await withDevFastTimeout(readLatestStagedShipmentPlanBatch(auth.requestId), {
    ok: true as const,
    ...getLocalLatestShipmentPlanBatchFallback(),
  });
  if (result.ok === false) {
    if (isDevFallbackEnabled()) {
      const fallback = getLocalLatestShipmentPlanBatchFallback();
      return json(auth.requestId, 200, {
        ok: true,
        import_batch_id: fallback.import_batch_id,
        stats: {
          rows_count: fallback.rows.length,
          shipments_count: new Set(fallback.rows.map((row) => row.shipment_id)).size,
          latest_pasted_at: fallback.rows[0]?.pasted_at ?? null,
        },
        rows: fallback.rows,
        fallback: "local",
      });
    }

    return json(auth.requestId, statusForCode(result.code), {
      ok: false,
      code: result.code,
      error: result.error,
      ...(result.details ? { details: result.details } : {}),
    });
  }

  const shipments = new Set<string>();
  let latestPastedAt: string | null = null;

  for (const row of result.rows) {
    shipments.add(row.shipment_id);
    if (row.pasted_at && (!latestPastedAt || row.pasted_at > latestPastedAt)) {
      latestPastedAt = row.pasted_at;
    }
  }

  return json(auth.requestId, 200, {
    ok: true,
    import_batch_id: result.import_batch_id,
    stats: {
      rows_count: result.rows.length,
      shipments_count: shipments.size,
      latest_pasted_at: latestPastedAt,
    },
    rows: result.rows,
  });
}

import { NextResponse } from "next/server";

import { withDevFastTimeout } from "@/lib/dev/localReadFallbacks";
import { getLocalPickingDraft, shouldUseLocalPickingFallback } from "@/lib/dev/pickingLocal";
import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { getPickingDraft } from "@/lib/picking/getPickingDraft";
import { requireAnyRole } from "@/lib/server/guards";

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: {
      [REQUEST_ID_HEADER]: requestId,
    },
  });
}

function statusForDraftError(code: string): number {
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

  const shipmentId = new URL(request.url).searchParams.get("shipment_id")?.trim() ?? "";
  if (!shipmentId) {
    return json(auth.requestId, 400, {
      ok: false,
      code: "VALIDATION_ERROR",
      error: "shipment_id is required",
    });
  }

  const localDraft = getLocalPickingDraft(shipmentId);
  const result = await withDevFastTimeout(
    getPickingDraft(auth.requestId, shipmentId),
    localDraft
      ? {
          ok: true as const,
          shipment: localDraft.shipment,
          summary: localDraft.summary,
          lines: localDraft.lines,
        }
      : {
          ok: false as const,
          code: "NOT_FOUND",
          error: "Shipment not found",
        }
  );
  if (result.ok === false) {
    if (shouldUseLocalPickingFallback()) {
      if (localDraft) {
        return json(auth.requestId, 200, {
          ok: true,
          shipment: localDraft.shipment,
          summary: localDraft.summary,
          lines: localDraft.lines,
          fallback: "local",
        });
      }
    }

    return json(auth.requestId, statusForDraftError(result.code), {
      ok: false,
      code: result.code,
      error: result.error,
      ...(result.details ? { details: result.details } : {}),
    });
  }

  return json(auth.requestId, 200, result);
}

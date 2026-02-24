import { NextResponse } from "next/server";

import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { getShipmentWithLines } from "@/lib/shipments/readShipments";
import { requireAnyRole } from "@/lib/server/guards";

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

export async function GET(request: Request, context: { params: { id: string } }) {
  const auth = requireAnyRole(request, ["OWNER", "COO"]);
  if (auth.ok === false) {
    return auth.response;
  }

  const { id } = context.params;
  const shipmentId = id.trim();

  if (!shipmentId) {
    return json(auth.requestId, 404, {
      ok: false,
      error: "Shipment not found",
      code: "NOT_FOUND",
    });
  }

  const result = await getShipmentWithLines(auth.requestId, shipmentId);

  if (result.ok === false) {
    return json(auth.requestId, statusForShipmentsCode(result.code), {
      ok: false,
      error: result.error,
      code: result.code,
      ...(result.details ? { details: result.details } : {}),
    });
  }

  return json(auth.requestId, 200, {
    ok: true,
    shipment: result.data.shipment,
    lines: result.data.lines,
  });
}

import { NextResponse } from "next/server";

import { statusForErrorCode } from "@/lib/api/gasError";
import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { readPickingListById } from "@/lib/picking/readPickingSheets";
import { requireAnyRole } from "@/lib/server/guards";

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

export async function GET(request: Request, context: { params: { id: string } }) {
  const auth = requireAnyRole(request, ["OWNER", "COO"]);
  if (auth.ok === false) {
    return auth.response;
  }

  const requestId = auth.requestId;
  const id = context.params.id.trim();

  const result = await readPickingListById(requestId, id);
  if (result.ok === false) {
    return json(requestId, statusForPickingError(result.code), {
      ok: false,
      code: result.code,
      error: result.error,
      ...(result.details ? { details: result.details } : {}),
    });
  }

  return json(requestId, 200, {
    ok: true,
    picking_list: result.picking_list,
    lines: result.lines,
  });
}

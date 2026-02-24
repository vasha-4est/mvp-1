import { NextResponse } from "next/server";

import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { readPickingLines, readPickingLists } from "@/lib/picking/readPickingSheets";
import { requireAnyRole } from "@/lib/server/guards";

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: {
      [REQUEST_ID_HEADER]: requestId,
    },
  });
}

function toStatus(code: string): number {
  if (code === "SHEET_MISSING") return 500;
  if (code === "UNAUTHORIZED") return 401;
  return 502;
}

export async function GET(request: Request, context: { params: { id: string } }) {
  const auth = requireAnyRole(request, ["OWNER", "COO"]);
  if (auth.ok === false) {
    return auth.response;
  }

  const requestId = auth.requestId;
  const id = context.params.id.trim();

  const [listsResult, linesResult] = await Promise.all([readPickingLists(requestId), readPickingLines(requestId)]);

  if (listsResult.ok === false) {
    return json(requestId, toStatus(listsResult.code), {
      ok: false,
      code: listsResult.code,
      error: listsResult.error,
      ...(listsResult.details ? { details: listsResult.details } : {}),
    });
  }

  if (linesResult.ok === false) {
    return json(requestId, toStatus(linesResult.code), {
      ok: false,
      code: linesResult.code,
      error: linesResult.error,
      ...(linesResult.details ? { details: linesResult.details } : {}),
    });
  }

  const pickingList = listsResult.items.find((item) => item.picking_list_id === id);
  if (!pickingList) {
    return json(requestId, 404, {
      ok: false,
      code: "NOT_FOUND",
    });
  }

  return json(requestId, 200, {
    ok: true,
    picking_list: pickingList,
    lines: linesResult.items
      .filter((item) => item.picking_list_id === id)
      .map(({ picking_list_id: _pickingListId, ...line }) => line),
  });
}

import { NextResponse } from "next/server";

import { getFlags } from "@/lib/flags/runtime";
import { REQUEST_ID_HEADER, getOrCreateRequestId } from "@/lib/obs/requestId";

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: {
      [REQUEST_ID_HEADER]: requestId,
    },
  });
}

export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);
  const result = await getFlags(requestId);

  if (result.ok === false) {
    const status = result.code === "SHEET_MISSING" ? 500 : 502;
    return json(requestId, status, {
      ok: false,
      code: result.code,
      error: result.error,
    });
  }

  return json(requestId, 200, {
    ok: true,
    flags: result.flags,
    updated_at: result.updated_at,
  });
}

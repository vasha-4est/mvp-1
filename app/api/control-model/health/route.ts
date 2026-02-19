import { NextResponse } from "next/server";

import { getOrCreateRequestId } from "@/lib/obs/requestId";
import { isStorageError, listUsers } from "@/lib/server/controlModel";

export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);

  try {
    const users = await listUsers({ page: 1, pageSize: 1, requestId });
    return NextResponse.json({ ok: true, rows_seen: users.total, debug: users.diagnostics });
  } catch (error) {
    if (isStorageError(error)) {
      return NextResponse.json(
        {
          ok: false,
          code: "CONTROL_MODEL_UNAVAILABLE",
          error: "Control model unavailable",
          debug: error.diagnostics,
        },
        { status: 503 }
      );
    }

    return NextResponse.json({ ok: false, code: "INTERNAL_ERROR" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";

import { withApiLog } from "@/lib/obs/apiLog";
import { isStorageError, provisionUsers } from "@/lib/server/controlModel";
import { requireOwner } from "@/lib/server/guards";

export async function GET(request: Request) {
  return NextResponse.json({ ok: false, code: "METHOD_NOT_ALLOWED", error: "Use POST" }, { status: 405 });
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const path = new URL(request.url).pathname;
  const auth = requireOwner(request);

  if (auth.ok === false) {
    return withApiLog(auth.response, {
      startedAt,
      requestId: auth.requestId,
      method: request.method,
      path,
      actor: "owner",
      code: auth.response.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN",
    });
  }

  const requestId = auth.requestId;
  const debugEnabled = new URL(request.url).searchParams.get("debug") === "1";

  const finalize = (response: NextResponse, code?: string) =>
    withApiLog(response, {
      startedAt,
      requestId,
      method: request.method,
      path,
      actor: "owner",
      ...(code ? { code } : {}),
    });

  try {
    const result = await provisionUsers(requestId);

    return finalize(
      NextResponse.json({
        ok: true,
        provisioned_count: result.provisioned_count,
        processed: result.processed,
        alreadyHashed: result.alreadyHashed,
        skippedInactive: result.skippedInactive,
        skippedNoPassword: result.skippedNoPassword,
        ...(debugEnabled ? { debug: result.diagnostics } : {}),
      })
    );
  } catch (error) {
    if (isStorageError(error)) {
      return finalize(
        NextResponse.json(
          {
            ok: false,
            error: "Control model unavailable",
            code: "CONTROL_MODEL_UNAVAILABLE",
            ...(debugEnabled && error.diagnostics ? { debug: error.diagnostics } : {}),
          },
          { status: 503 }
        ),
        "CONTROL_MODEL_UNAVAILABLE"
      );
    }

    return finalize(
      NextResponse.json(
        {
          ok: false,
          error: "Internal server error",
          code: "INTERNAL_ERROR",
        },
        { status: 500 }
      ),
      "INTERNAL_ERROR"
    );
  }
}

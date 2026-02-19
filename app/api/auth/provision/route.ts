import { NextResponse } from "next/server";

import { withApiLog } from "@/lib/obs/apiLog";
import { getControlModelStoreDiagnostics, isStorageError, provisionUsers } from "@/lib/server/controlModel";
import { requireOwner } from "@/lib/server/guards";

function buildDebug(error?: string) {
  return {
    ...getControlModelStoreDiagnostics(error),
    control_model: {
      gas_url_present: Boolean(process.env.GAS_WEBAPP_URL),
      gas_key_present: Boolean(process.env.GAS_API_KEY),
    },
    sheets: {
      tried: false,
    },
  };
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
    const result = await provisionUsers();

    return finalize(
      NextResponse.json({
        ok: true,
        ...result,
        migratedLegacy: result.migratedLegacy,
        alreadyHashed: result.alreadyHashed,
        skippedInactive: result.skippedInactive,
        ...(debugEnabled ? { debug: buildDebug() } : {}),
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
            ...(debugEnabled ? { debug: buildDebug(error.diagnostics?.store_init_error) } : {}),
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

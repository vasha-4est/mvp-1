import { NextResponse } from "next/server";

import { withApiLog } from "@/lib/obs/apiLog";
import { getControlModelStoreDiagnostics, provisionUsersFromGas, readUsersDirectoryFromGas } from "@/lib/server/controlModel";
import { requireOwner } from "@/lib/server/guards";

function buildDebug(params?: { error?: string; sheets?: Record<string, unknown> }) {
  return {
    ...getControlModelStoreDiagnostics(params?.error),
    control_model: {
      gas_url_present: Boolean(process.env.GAS_WEBAPP_URL),
      gas_key_present: Boolean(process.env.GAS_API_KEY),
    },
    sheets: params?.sheets ?? {
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
    const snapshot = await readUsersDirectoryFromGas(requestId);
    const result = await provisionUsersFromGas(requestId);

    return finalize(
      NextResponse.json({
        ok: true,
        ...result,
        ...(debugEnabled
          ? {
              debug: buildDebug({
                sheets: {
                  tried: true,
                  header_ok: snapshot.diagnostics.header_ok,
                  header_row_index: snapshot.diagnostics.header_row_index,
                  header_row_values: snapshot.diagnostics.header_row_values,
                  headers_seen: snapshot.diagnostics.headers_seen,
                },
              }),
            }
          : {}),
      })
    );
  } catch (error) {
    return finalize(
      NextResponse.json(
        {
          ok: false,
          error: error instanceof Error ? error.message : "Control model unavailable",
          code: "CONTROL_MODEL_UNAVAILABLE",
          ...(debugEnabled ? { debug: buildDebug({ error: error instanceof Error ? error.message : undefined }) } : {}),
        },
        { status: 503 }
      ),
      "CONTROL_MODEL_UNAVAILABLE"
    );
  }
}

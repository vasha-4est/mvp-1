import { NextResponse } from "next/server";

import { withApiLog } from "@/lib/obs/apiLog";
import { getControlModelStoreDiagnostics, isStorageError, provisionUsers } from "@/lib/server/controlModel";
import { requireOwner } from "@/lib/server/guards";
import { readUsersDirectoryFromGas } from "@/lib/server/usersDirectory";

async function buildDebug(error?: string) {
  let sheets: Record<string, unknown> = { tried: false };

  if (process.env.GAS_WEBAPP_URL) {
    try {
      const source = await readUsersDirectoryFromGas("auth-provision-debug");
      sheets = {
        users_directory_found: source.debug.users_directory_found,
        available_sheet_names: source.debug.available_sheet_names,
        header_row_index: source.debug.header_row_index,
        header_row_values: source.debug.header_row_values,
        headers_seen: source.debug.headers_seen,
        missing_required: source.debug.missing_required,
        header_ok: source.debug.header_ok,
      };
    } catch {
      sheets = {
        users_directory_found: false,
        available_sheet_names: [],
        header_row_index: null,
        header_row_values: [],
        headers_seen: [],
        missing_required: ["id", "username", "password"],
        header_ok: false,
      };
    }
  }

  return {
    ...getControlModelStoreDiagnostics(error),
    control_model: {
      gas_url_present: Boolean(process.env.GAS_WEBAPP_URL),
      gas_key_present: Boolean(process.env.GAS_API_KEY),
    },
    sheets,
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
        provisioned_count: result.provisioned_count,
        processed: result.processed,
        migratedLegacy: result.migratedLegacy,
        alreadyHashed: result.alreadyHashed,
        skippedInactive: result.skippedInactive,
        skippedNoPassword: result.skippedNoPassword,
        items: result.items,
        ...(debugEnabled ? { debug: { ...(await buildDebug()), sample_rows: result.debug_samples } } : {}),
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
            ...(debugEnabled ? { debug: await buildDebug(error.diagnostics?.store_init_error) } : {}),
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

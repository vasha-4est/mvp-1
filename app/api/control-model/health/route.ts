import { NextResponse } from "next/server";

import { REQUEST_ID_HEADER, getOrCreateRequestId } from "@/lib/obs/requestId";
import { readUsersDirectoryFromGas } from "@/lib/server/usersDirectory";

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: requestId } });
}

export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);
  const debugEnabled = new URL(request.url).searchParams.get("debug") === "1";

  try {
    const data = await readUsersDirectoryFromGas(requestId);

    return json(requestId, 200, {
      ok: true,
      header_ok: data.debug.header_ok,
      ...(debugEnabled
        ? {
            debug: {
              sheets: {
                users_directory_found: data.debug.users_directory_found,
                available_sheet_names: data.debug.available_sheet_names,
                header_row_index: data.debug.header_row_index,
                header_row_values: data.debug.header_row_values,
                headers_seen: data.debug.headers_seen,
                missing_required: data.debug.missing_required,
                header_ok: data.debug.header_ok,
                sheet_last_row: data.debug.sheet_last_row,
                sheet_last_col: data.debug.sheet_last_col,
                scanned_rows_preview: data.debug.scanned_rows_preview,
              },
            },
          }
        : {}),
    });
  } catch (error) {
    return json(requestId, 502, {
      ok: false,
      code: "CONTROL_MODEL_SHEET_INVALID",
      error: error instanceof Error ? error.message : "CONTROL_MODEL_SHEET_INVALID",
      ...(debugEnabled
        ? {
            debug: {
              sheets: {
                users_directory_found: false,
                available_sheet_names: [],
                header_row_index: null,
                header_row_values: [],
                headers_seen: [],
                missing_required: ["id", "username", "password"],
                header_ok: false,
              },
            },
          }
        : {}),
    });
  }
}

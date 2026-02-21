import { NextResponse } from "next/server";

import { REQUEST_ID_HEADER, getOrCreateRequestId } from "@/lib/obs/requestId";
import { readUsersDirectoryFromGas } from "@/lib/server/usersDirectory";

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: requestId } });
}

function safeStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);
  const debugEnabled = new URL(request.url).searchParams.get("debug") === "1";
  const includeDebug = debugEnabled && (process.env.VERCEL_ENV || "unknown") !== "production";

  try {
    const data = await readUsersDirectoryFromGas(requestId);

    const usersDirectorySampleTypes = includeDebug
      ? data.users.slice(0, 2).map((row) => ({
          is_active: {
            type: typeof row.is_active,
            value: safeStringify(row.is_active),
          },
          must_change_password: {
            type: typeof row.must_change_password,
            value: safeStringify(row.must_change_password),
          },
        }))
      : undefined;

    return json(requestId, 200, {
      ok: true,
      header_ok: data.debug.header_ok,
      ...(includeDebug
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
              users_directory_sample_types: usersDirectorySampleTypes,
            },
          }
        : {}),
    });
  } catch (error) {
    return json(requestId, 502, {
      ok: false,
      code: "CONTROL_MODEL_SHEET_INVALID",
      error: error instanceof Error ? error.message : "CONTROL_MODEL_SHEET_INVALID",
      ...(includeDebug
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
              users_directory_sample_types: [],
            },
          }
        : {}),
    });
  }
}

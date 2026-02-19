import { NextResponse } from "next/server";

import { getOrCreateRequestId, REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { getControlModelStoreDiagnostics, getUsersDirectoryHealthDebug, isStorageError } from "@/lib/server/controlModel";

function includeDebug(url: URL) {
  return url.searchParams.get("debug") === "1";
}

export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);
  const wantsDebug = includeDebug(new URL(request.url));

  try {
    const sheets = await getUsersDirectoryHealthDebug();

    return NextResponse.json(
      {
        ok: true,
        status: "ok",
        ...(wantsDebug
          ? {
              debug: {
                ...getControlModelStoreDiagnostics(),
                sheets,
              },
            }
          : {}),
      },
      { status: 200, headers: { [REQUEST_ID_HEADER]: requestId } }
    );
  } catch (error) {
    if (isStorageError(error)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Control model unavailable",
          code: "CONTROL_MODEL_UNAVAILABLE",
          ...(wantsDebug
            ? {
                debug: {
                  ...getControlModelStoreDiagnostics(error.diagnostics?.store_init_error),
                  sheets: {
                    header_ok: false,
                    headers_seen: [],
                    missing_required: ["id", "username", "password"],
                  },
                },
              }
            : {}),
        },
        { status: 503, headers: { [REQUEST_ID_HEADER]: requestId } }
      );
    }

    return NextResponse.json(
      { ok: false, error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500, headers: { [REQUEST_ID_HEADER]: requestId } }
    );
  }
}

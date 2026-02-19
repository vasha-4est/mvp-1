import { NextResponse } from "next/server";

import { REQUEST_ID_HEADER, getOrCreateRequestId } from "@/lib/obs/requestId";
import { readUsersDirectoryFromGas } from "@/lib/server/controlModel";

export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);
  const debugEnabled = new URL(request.url).searchParams.get("debug") === "1";

  try {
    const snapshot = await readUsersDirectoryFromGas(requestId);

    return NextResponse.json(
      {
        ok: true,
        header_ok: snapshot.diagnostics.header_ok,
        ...(debugEnabled
          ? {
              debug: {
                sheets: {
                  header_ok: snapshot.diagnostics.header_ok,
                  header_row_index: snapshot.diagnostics.header_row_index,
                  header_row_values: snapshot.diagnostics.header_row_values,
                  headers_seen: snapshot.diagnostics.headers_seen,
                },
              },
            }
          : {}),
      },
      { headers: { [REQUEST_ID_HEADER]: requestId } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Control model unavailable",
      },
      { status: 503, headers: { [REQUEST_ID_HEADER]: requestId } }
    );
  }
}

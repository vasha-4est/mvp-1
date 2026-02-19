import { NextResponse } from "next/server";

import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { isStorageError, listUsers } from "@/lib/server/controlModel";
import { requireOwner } from "@/lib/server/guards";

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: requestId } });
}

function includeDebug(url: URL) {
  return url.searchParams.get("debug") === "1";
}

export async function GET(request: Request) {
  const auth = requireOwner(request);
  if (auth.ok === false) {
    return auth.response;
  }

  const url = new URL(request.url);
  const wantsDebug = includeDebug(url);

  try {
    const page = Number(url.searchParams.get("page") ?? "1");
    const pageSize = Number(url.searchParams.get("pageSize") ?? "20");
    const username = url.searchParams.get("username") ?? undefined;

    const data = await listUsers({
      page: Number.isFinite(page) && page > 0 ? page : 1,
      pageSize: Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 100) : 20,
      username,
      requestId: auth.requestId,
    });

    return json(auth.requestId, 200, {
      ok: true,
      data: {
        total: data.total,
        users: data.users,
      },
      ...(wantsDebug ? { debug: data.diagnostics } : {}),
    });
  } catch (error) {
    if (isStorageError(error)) {
      return json(auth.requestId, 503, {
        ok: false,
        error: "Control model unavailable",
        code: "CONTROL_MODEL_UNAVAILABLE",
        ...(wantsDebug && error.diagnostics ? { debug: error.diagnostics } : {}),
      });
    }

    return json(auth.requestId, 500, { ok: false, error: "Internal server error", code: "INTERNAL_ERROR" });
  }
}

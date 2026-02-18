import { NextResponse } from "next/server";

import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { isStorageError, setUserStatusById } from "@/lib/server/controlModel";
import { requireOwner } from "@/lib/server/guards";

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: requestId } });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = requireOwner(request);
  if (auth.ok === false) {
    return auth.response;
  }

  try {
    let body: unknown = null;
    try {
      body = await request.json();
    } catch {
      body = null;
    }

    const status = (body as { status?: unknown })?.status;
    if (status !== "active" && status !== "disabled") {
      return json(auth.requestId, 400, { ok: false, error: "Validation error", code: "VALIDATION_ERROR" });
    }

    const ok = await setUserStatusById(params.id, status);
    if (!ok) {
      return json(auth.requestId, 404, { ok: false, error: "Not found", code: "NOT_FOUND" });
    }

    return json(auth.requestId, 200, { ok: true, data: { user_id: params.id, status } });
  } catch (error) {
    if (isStorageError(error)) {
      return json(auth.requestId, 500, { ok: false, error: "Storage error", code: "STORAGE_ERROR" });
    }

    return json(auth.requestId, 500, { ok: false, error: "Internal server error", code: "INTERNAL_ERROR" });
  }
}

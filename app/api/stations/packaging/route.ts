import { NextResponse } from "next/server";

import { statusForErrorCode } from "@/lib/api/gasError";
import { REQUEST_ID_HEADER, getOrCreateRequestId } from "@/lib/obs/requestId";
import { requireAnyRole } from "@/lib/server/guards";
import { getPackagingQueue, type PackagingQueueItem } from "@/lib/stations/packaging/getPackagingQueue";

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: {
      [REQUEST_ID_HEADER]: requestId,
    },
  });
}

function isPackagingQueueItem(value: unknown): value is PackagingQueueItem {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<PackagingQueueItem>;

  return (
    typeof candidate.batch_code === "string" &&
    typeof candidate.product === "string" &&
    typeof candidate.quantity === "number" &&
    Number.isFinite(candidate.quantity) &&
    typeof candidate.created_at === "string"
  );
}

export async function GET(request: Request) {
  const auth = requireAnyRole(request, ["OWNER", "COO"]);
  if (auth.ok === false) {
    return auth.response;
  }

  const requestId = auth.requestId;

  try {
    const result = await getPackagingQueue(requestId);

    if (result.ok === false) {
      return json(requestId, statusForErrorCode(result.code), {
        ok: false,
        error: {
          message: result.error,
          code: result.code,
        },
      });
    }

    const safeItems = result.items.filter(isPackagingQueueItem);

    return json(requestId, 200, {
      ok: true,
      items: safeItems,
    });
  } catch {
    const requestIdForError = requestId || getOrCreateRequestId(request);
    return json(requestIdForError, 500, {
      ok: false,
      error: {
        message: "Internal server error",
        code: "INTERNAL_ERROR",
      },
    });
  }
}

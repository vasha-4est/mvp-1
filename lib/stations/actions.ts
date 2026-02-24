import { NextResponse } from "next/server";

import { parseErrorPayload, statusForErrorCode } from "@/lib/api/gasError";
import { callGas } from "@/lib/integrations/gasClient";
import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { requireRole } from "@/lib/server/guards";

export type StationName = "packaging" | "labeling" | "qc" | "assembly";
export type StationAction = "take" | "release" | "advance";

type BatchRecord = {
  code?: unknown;
  status?: unknown;
  assigned_to?: unknown;
};

const ALLOWED_STATIONS = new Set<StationName>(["packaging", "labeling", "qc", "assembly"]);

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: {
      [REQUEST_ID_HEADER]: requestId,
    },
  });
}

function normalized(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isOwner(roles: string[]): boolean {
  return roles.some((role) => role.trim().toUpperCase() === "OWNER");
}

async function loadBatch(
  code: string,
  requestId: string
): Promise<{ ok: true; batch: BatchRecord } | { ok: false; response: NextResponse }> {
  const response = await callGas<BatchRecord>("batch_fetch", { code }, requestId);

  if (!response.ok || !response.data) {
    const parsed = parseErrorPayload((response as { error?: unknown }).error);
    return {
      ok: false,
      response: json(requestId, statusForErrorCode(parsed.code), {
        ok: false,
        error: parsed.error,
        code: parsed.code,
        ...(parsed.details ? { details: parsed.details } : {}),
      }),
    };
  }

  return { ok: true, batch: response.data };
}

function parseBodyForCode(body: unknown): { code?: string; error?: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Body must be a JSON object" };
  }

  const obj = body as Record<string, unknown>;
  const code = normalized(obj.batch_code ?? obj.code);
  if (!code) {
    return { error: "Field 'batch_code' (or 'code') is required" };
  }

  return { code };
}

export async function handleStationAction(request: Request, station: StationName, action: StationAction) {
  const auth = requireRole(request, ["OWNER", "COO"]);
  if (auth.ok === false) {
    return auth.response;
  }

  if (!ALLOWED_STATIONS.has(station)) {
    return json(auth.requestId, 404, { ok: false, error: "Not found", code: "NOT_FOUND" });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(auth.requestId, 400, { ok: false, error: "Invalid JSON body", code: "VALIDATION_ERROR" });
  }

  const parsed = parseBodyForCode(body);
  if (!parsed.code) {
    return json(auth.requestId, 400, { ok: false, error: parsed.error, code: "VALIDATION_ERROR" });
  }

  if (action === "take" || action === "release") {
    return json(auth.requestId, 501, {
      ok: false,
      error: "Assignment actions not implemented in current FSM",
      code: "NOT_IMPLEMENTED",
    });
  }

  if (station !== "assembly") {
    return json(auth.requestId, 409, {
      ok: false,
      error: "Advance not supported for this station",
      code: "ADVANCE_NOT_SUPPORTED",
    });
  }

  const loaded = await loadBatch(parsed.code, auth.requestId);
  if (loaded.ok === false) {
    return loaded.response;
  }

  const assignedTo = normalized(loaded.batch.assigned_to);
  if (assignedTo !== auth.user.user_id && !isOwner(auth.user.roles)) {
    return json(auth.requestId, 409, {
      ok: false,
      error: "Batch must be assigned to current user before advancing",
      code: "NOT_ASSIGNED",
    });
  }

  const currentStatus = normalized(loaded.batch.status)?.toLowerCase();
  if (currentStatus !== "ready") {
    return json(auth.requestId, 409, {
      ok: false,
      error: "Batch is not in expected status for this station",
      code: "ILLEGAL_TRANSITION",
      details: {
        expected: "ready",
        current: currentStatus,
      },
    });
  }

  const advance = await callGas<unknown>(
    "batch_status_patch",
    {
      code: parsed.code,
      to_status: "closed",
      idempotency_key: `${station}:advance:${parsed.code}:${auth.user.user_id}`,
    },
    auth.requestId
  );

  if (!advance.ok) {
    const err = parseErrorPayload((advance as { error?: unknown }).error);
    return json(auth.requestId, statusForErrorCode(err.code), {
      ok: false,
      error: err.error,
      code: err.code,
      ...(err.details ? { details: err.details } : {}),
    });
  }

  return json(auth.requestId, 200, { ok: true, batch_code: parsed.code, to_status: "closed" });
}

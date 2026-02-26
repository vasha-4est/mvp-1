import { NextResponse } from "next/server";

import { parseErrorPayload } from "@/lib/api/gasError";
import { callGas } from "@/lib/integrations/gasClient";
import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { requireOwner } from "@/lib/server/guards";

type Body = { lock_key?: unknown; reason?: unknown; override_reason?: unknown };
type OverrideResponse = { lock_key?: unknown; changed?: unknown; replayed?: unknown };

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: requestId } });
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function mapError(requestId: string, error: unknown) {
  const parsed = parseErrorPayload(error);
  if (parsed.code === "FORBIDDEN") return json(requestId, 403, { ok: false, code: "FORBIDDEN", error: parsed.error });
  if (parsed.code === "VALIDATION_ERROR" || parsed.code === "BAD_REQUEST") return json(requestId, 400, { ok: false, code: "VALIDATION_ERROR", error: parsed.error });
  if (parsed.code === "NOT_FOUND") return json(requestId, 404, { ok: false, code: "NOT_FOUND", error: parsed.error });
  return json(requestId, 502, { ok: false, code: parsed.code, error: parsed.error, ...(parsed.details ? { details: parsed.details } : {}) });
}

export async function POST(request: Request) {
  const auth = requireOwner(request);
  if (auth.ok === false) return auth.response;

  const requestId = request.headers.get(REQUEST_ID_HEADER)?.trim() ?? "";
  if (!requestId) return json(auth.requestId, 400, { ok: false, code: "VALIDATION_ERROR", error: "x-request-id is required" });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return json(requestId, 400, { ok: false, code: "VALIDATION_ERROR", error: "Invalid JSON body" });
  }

  const reason = str(body.reason) || str(body.override_reason);
  if (!reason) return json(requestId, 400, { ok: false, code: "VALIDATION_ERROR", error: "reason is required" });

  const gas = await callGas<OverrideResponse>("locks.override", { lock_key: str(body.lock_key), reason }, requestId);
  if (!gas.ok || !gas.data) return mapError(requestId, (gas as { error?: unknown }).error);

  const replayed = gas.data.replayed === true;
  const changed = gas.data.changed === true;
  return json(requestId, changed && !replayed ? 201 : 200, {
    ok: true,
    ...(replayed ? { replayed: true } : {}),
    lock_key: str(gas.data.lock_key),
  });
}

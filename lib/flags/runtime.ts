import { NextResponse } from "next/server";

import { parseErrorPayload } from "@/lib/api/gasError";
import { callGasRead } from "@/lib/integrations/gasRead";
import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";

type FlagsResponse = {
  ok?: boolean;
  flags?: Record<string, unknown>;
  updated_at?: unknown;
};

export async function getFlags(
  requestId: string
): Promise<
  { ok: true; flags: Record<string, boolean>; updated_at: string } | { ok: false; code: string; error: string }
> {
  const response = await callGasRead<FlagsResponse>("flags.get", {}, requestId);
  if (!response.ok || !response.data) {
    const parsed = parseErrorPayload(response.error);
    return {
      ok: false,
      code: parsed.code,
      error: parsed.error,
    };
  }

  const source = response.data.flags && typeof response.data.flags === "object" ? response.data.flags : {};
  const normalized: Record<string, boolean> = {};

  for (const [key, value] of Object.entries(source)) {
    normalized[key] = Boolean(value);
  }

  const updatedAt = typeof response.data.updated_at === "string" ? response.data.updated_at : new Date().toISOString();

  return {
    ok: true,
    flags: normalized,
    updated_at: updatedAt,
  };
}

export async function requireWritable(request: Request, requestId: string): Promise<NextResponse | null> {
  // Read-only guard: if SYSTEM_READONLY is ON -> block all mutations.
  // Fail-open: if flags cannot be loaded, do not block (avoid breaking ops due to flags fetch outage).
  const flagsRes = await getFlags(requestId);
  if (!("ok" in flagsRes) || flagsRes.ok !== true) {
    return null;
  }

  if (flagsRes.flags?.SYSTEM_READONLY === true) {
    return NextResponse.json(
      { ok: false, error: "SYSTEM_READONLY", code: "READ_ONLY" },
      { status: 503, headers: { [REQUEST_ID_HEADER]: requestId } }
    );
  }

  return null;
}

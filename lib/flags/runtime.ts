import { NextResponse } from "next/server";

import { parseErrorPayload } from "@/lib/api/gasError";
import { callGas } from "@/lib/integrations/gasClient";
import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";

export type FlagValue = boolean | string | number;

export type GetFlagsOk = {
  ok: true;
  flags: Record<string, FlagValue>;
  updated_at: string;
};

export type GetFlagsError = {
  ok: false;
  code: string;
  error: string;
};

function normalizeFlagValue(value: unknown): FlagValue | null {
  if (typeof value === "boolean" || typeof value === "string") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  return null;
}

function isConfigFlagsSheetMissing(error: { code: string; error: string }): boolean {
  if (error.code === "SHEET_MISSING") {
    return true;
  }

  const message = `${error.code}:${error.error}`.toLowerCase();
  return message.includes("missing sheet") && message.includes("config_flags");
}

export async function getFlags(requestId: string): Promise<GetFlagsOk | GetFlagsError> {
  const response = await callGas<{ flags?: unknown; updated_at?: unknown }>("flags.get", {}, requestId);

  if (!response.ok || !response.data) {
    const parsed = parseErrorPayload((response as { error?: unknown }).error);
    if (isConfigFlagsSheetMissing(parsed)) {
      return {
        ok: false,
        code: "SHEET_MISSING",
        error: "Required sheet 'config_flags' is missing in OPS_DB",
      };
    }

    return {
      ok: false,
      code: parsed.code,
      error: parsed.error,
    };
  }

  const rawFlags =
    typeof response.data.flags === "object" && response.data.flags !== null && !Array.isArray(response.data.flags)
      ? (response.data.flags as Record<string, unknown>)
      : {};

  const flags: Record<string, FlagValue> = {};
  for (const [key, value] of Object.entries(rawFlags)) {
    const normalized = normalizeFlagValue(value);
    if (normalized !== null) {
      flags[key] = normalized;
    }
  }

  const updatedAt =
    typeof response.data.updated_at === "string" && response.data.updated_at.trim().length > 0
      ? response.data.updated_at
      : new Date().toISOString();

  return { ok: true, flags, updated_at: updatedAt };
}

export function isFlagEnabled(flags: Record<string, FlagValue>, key: string): boolean {
  const value = flags[key];

  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
  }

  return false;
}

export async function requireWritable(request: Request, requestId: string): Promise<NextResponse | null> {
  const flagsResult = await getFlags(requestId);
  if (!flagsResult.ok) {
    return null;
  }

  if (!isFlagEnabled(flagsResult.flags, "SYSTEM_READONLY")) {
    return null;
  }

  return NextResponse.json(
    {
      ok: false,
      code: "SYSTEM_READONLY",
      error: "System is read-only",
    },
    {
      status: 503,
      headers: {
        [REQUEST_ID_HEADER]: requestId,
      },
    }
  );
}

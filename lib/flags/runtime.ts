import { parseErrorPayload } from "@/lib/api/gasError";
import { callGas } from "@/lib/integrations/gasClient";

type FlagsResponse = {
  ok?: boolean;
  flags?: Record<string, unknown>;
  updated_at?: unknown;
};

export async function getFlags(
  requestId: string
): Promise<{ ok: true; flags: Record<string, boolean>; updated_at: string } | { ok: false; code: string; error: string }> {
  const response = await callGas<FlagsResponse>("flags.get", {}, requestId);
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

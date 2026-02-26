import { NextResponse } from "next/server";

import { statusForErrorCode } from "@/lib/api/gasError";
import { getEodSnapshot, upsertEodSnapshot } from "@/lib/eod/snapshot";
import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { requireAnyRole } from "@/lib/server/guards";

const DEFAULT_TZ = "Europe/Moscow";
const RETRY_BACKOFF_MS = [800, 1400, 2200];
const CORE_OUTAGE_ERROR = "core EOD sources unavailable";

type UpstreamAttemptError = {
  key?: string;
  status?: number;
  code?: string;
  error?: string;
  ms?: number;
  rid?: string;
  action?: string;
};

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: requestId } });
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function intOrDefault(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function isTransientGatewayFailure(code: string, error: string): boolean {
  if (code === "BAD_GATEWAY") return true;
  const normalized = error.toLowerCase();
  return normalized.includes("timed out") || normalized.includes("timeout");
}

function isCoreOutageError(code: string, error: string): boolean {
  return code === "BAD_GATEWAY" || error.toLowerCase().includes(CORE_OUTAGE_ERROR.toLowerCase());
}

function asAttemptError(value: unknown): UpstreamAttemptError | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as UpstreamAttemptError;
}

function extractCoreDetails(details: unknown): UpstreamAttemptError[] {
  if (!details || typeof details !== "object" || Array.isArray(details)) return [];
  const cores = (details as { cores?: unknown }).cores;
  if (!Array.isArray(cores)) return [];
  return cores.map(asAttemptError).filter((item): item is UpstreamAttemptError => item !== null);
}


function ensureNonEmptyCoreDetails(details: unknown): UpstreamAttemptError[] {
  const cores = extractCoreDetails(details);
  if (cores.length > 0) return cores;

  const fallback = [
    { key: "daily_summary", status: 502, code: "BAD_GATEWAY", error: "no core attempt recorded", action: "daily.summary.get" },
    { key: "control_tower", status: 502, code: "BAD_GATEWAY", error: "no core attempt recorded", action: "control_tower.read" },
  ];
  return fallback;
}

function extractSelectionDiagnostics(details: unknown) {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return { selected_core_keys: ["daily_summary", "control_tower"], disabled_reasons: [], evaluated_flags: {} };
  }

  const obj = details as { selected_core_keys?: unknown; disabled_reasons?: unknown; evaluated_flags?: unknown };
  return {
    selected_core_keys: Array.isArray(obj.selected_core_keys) ? obj.selected_core_keys : ["daily_summary", "control_tower"],
    disabled_reasons: Array.isArray(obj.disabled_reasons) ? obj.disabled_reasons : [],
    evaluated_flags:
      obj.evaluated_flags && typeof obj.evaluated_flags === "object" && !Array.isArray(obj.evaluated_flags)
        ? obj.evaluated_flags
        : {},
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function upsertWithRetry(requestId: string, payload: { date: string; tz: string; days_window: number }) {
  let attempts = 0;

  for (let index = 0; index <= RETRY_BACKOFF_MS.length; index += 1) {
    attempts += 1;

    // Idempotency first: if snapshot already exists for (date,tz), return it immediately.
    const existing = await getEodSnapshot(requestId, { date: payload.date, tz: payload.tz });
    if (existing.ok === true) {
      return {
        ok: true as const,
        status: 200,
        data: {
          ...existing.data,
          replayed: true,
          date: existing.data.snapshot_date,
        },
      };
    }

    const created = await upsertEodSnapshot(requestId, payload);
    if (created.ok === true) {
      return {
        ok: true as const,
        status: created.data.replayed ? 200 : 201,
        data: {
          ...created.data,
          date: created.data.snapshot_date,
        },
      };
    }

    // Core-source outages are upstream failures, never BAD_REQUEST.
    if (isCoreOutageError(created.code, created.error)) {
      return {
        ok: false as const,
        error: {
          ...created,
          code: "BAD_GATEWAY",
          error: CORE_OUTAGE_ERROR,
        },
        attempts,
      };
    }

    if (!isTransientGatewayFailure(created.code, created.error) || index === RETRY_BACKOFF_MS.length) {
      return {
        ok: false as const,
        error: created,
        attempts,
      };
    }

    await sleep(RETRY_BACKOFF_MS[index]);
  }

  return {
    ok: false as const,
    attempts,
    error: { ok: false as const, code: "BAD_GATEWAY", error: "Upstream timed out (GAS)" },
  };
}

export async function POST(request: Request) {
  const auth = requireAnyRole(request, ["OWNER", "COO"]);
  if (auth.ok === false) return auth.response;

  let body: { date?: unknown; tz?: unknown; days_window?: unknown } = {};
  try {
    body = (await request.json()) as { date?: unknown; tz?: unknown; days_window?: unknown };
  } catch {
    body = {};
  }

  const { searchParams } = new URL(request.url);
  const date = str(body.date) || str(searchParams.get("date"));
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return json(auth.requestId, 400, {
      ok: false,
      code: "BAD_REQUEST",
      error: "Field 'date' is required in YYYY-MM-DD format",
      request_id: auth.requestId,
    });
  }

  const tz = str(body.tz) || str(searchParams.get("tz")) || DEFAULT_TZ;
  const daysWindow = intOrDefault(body.days_window ?? searchParams.get("days_window"), 1);
  const result = await upsertWithRetry(auth.requestId, {
    date,
    tz,
    days_window: daysWindow,
  });

  if (result.ok === false) {
    if (result.error.code === "EOD_NO_CORE_SOURCES") {
      const diagnostics = extractSelectionDiagnostics(result.error.details);
      return json(auth.requestId, 400, {
        ok: false,
        code: "EOD_NO_CORE_SOURCES",
        error: "no core sources selected",
        request_id: auth.requestId,
        details: {
          date,
          tz,
          attempts: result.attempts,
          selected_core_keys: diagnostics.selected_core_keys,
          disabled_reasons: diagnostics.disabled_reasons,
          evaluated_flags: diagnostics.evaluated_flags,
        },
      });
    }

    if (isCoreOutageError(result.error.code, result.error.error)) {
      const cores = ensureNonEmptyCoreDetails(result.error.details);
      const diagnostics = extractSelectionDiagnostics(result.error.details);
      return json(auth.requestId, 502, {
        ok: false,
        code: "BAD_GATEWAY",
        error: CORE_OUTAGE_ERROR,
        request_id: auth.requestId,
        details: {
          date,
          tz,
          attempts: result.attempts,
          cores,
          selected_core_keys: diagnostics.selected_core_keys,
          disabled_reasons: diagnostics.disabled_reasons,
          evaluated_flags: diagnostics.evaluated_flags,
        },
      });
    }

    const isTransient = isTransientGatewayFailure(result.error.code, result.error.error);
    if (isTransient) {
      return json(auth.requestId, 502, {
        ok: false,
        code: "BAD_GATEWAY",
        error: "Upstream timed out (GAS)",
        request_id: auth.requestId,
        details: { attempts: result.attempts, date, tz },
      });
    }

    return json(auth.requestId, statusForErrorCode(result.error.code), {
      ok: false,
      error: result.error.error,
      code: result.error.code,
      request_id: auth.requestId,
      ...(result.error.details ? { details: result.error.details } : {}),
    });
  }

  const diagnostics = extractSelectionDiagnostics((result.data as { details?: unknown }).details);
  const cores = ensureNonEmptyCoreDetails((result.data as { details?: unknown }).details);

  return json(auth.requestId, result.status, {
    ...result.data,
    details: {
      ...(result.data as { details?: Record<string, unknown> }).details,
      cores,
      selected_core_keys: diagnostics.selected_core_keys,
      disabled_reasons: diagnostics.disabled_reasons,
      evaluated_flags: diagnostics.evaluated_flags,
    },
    request_id: auth.requestId,
  });
}

export async function GET(request: Request) {
  const auth = requireAnyRole(request, ["OWNER", "COO"]);
  if (auth.ok === false) return auth.response;

  const { searchParams } = new URL(request.url);
  const date = str(searchParams.get("date"));
  const tz = str(searchParams.get("tz")) || DEFAULT_TZ;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return json(auth.requestId, 400, {
      ok: false,
      code: "BAD_REQUEST",
      error: "Query param 'date' is required",
      request_id: auth.requestId,
    });
  }

  const result = await getEodSnapshot(auth.requestId, { date, tz });

  if (result.ok === false) {
    return json(auth.requestId, statusForErrorCode(result.code), {
      ok: false,
      error: result.error,
      code: result.code,
      request_id: auth.requestId,
      ...(result.details ? { details: result.details } : {}),
    });
  }

  return json(auth.requestId, 200, {
    ...result.data,
    date: result.data.snapshot_date,
    request_id: auth.requestId,
  });
}

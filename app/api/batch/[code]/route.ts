import { randomUUID } from "crypto";

import { NextResponse } from "next/server";

import { callGas } from "../../../../lib/integrations/gasClient";

type BatchRow = {
  id: string;
  code: string;
  status: string;
  created_at: string;
  request_id?: string;
  note?: string;
};

function normalizeErrorMessage(rawError: unknown, fallback: string): string {
  if (typeof rawError === "string") return rawError;
  if (rawError) return JSON.stringify(rawError);
  return fallback;
}

function mapErrorToStatus(errorMessage: string): number {
  const normalized = errorMessage.toLowerCase();

  if (normalized.includes("not_found")) return 404;
  if (normalized.includes("bad_request")) return 400;
  if (normalized.includes("lock_conflict") || normalized.includes("timed out")) return 503;

  return 502;
}

function isAuthorized(request: Request): boolean {
  const expectedApiKey = process.env.GAS_API_KEY;
  if (!expectedApiKey) return true;

  const incomingApiKey = request.headers.get("x-gas-api-key")?.trim();
  return incomingApiKey === expectedApiKey;
}

export async function GET(request: Request, context: { params: { code: string } }) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const code = decodeURIComponent(context.params.code || "").trim();
  if (!code) {
    return NextResponse.json({ ok: false, error: "Batch code is required" }, { status: 400 });
  }

  try {
    const gasResponse = await callGas<BatchRow>("batch_fetch", { code }, randomUUID());
    if (!gasResponse.ok || !gasResponse.data) {
      const rawErr: unknown = (gasResponse as unknown as { error?: unknown }).error;
      const error = normalizeErrorMessage(rawErr, "GAS batch_fetch failed");
      return NextResponse.json({ ok: false, error }, { status: mapErrorToStatus(error) });
    }

    return NextResponse.json({ ok: true, data: gasResponse.data }, { status: 200 });
  } catch (caughtError) {
    const message = caughtError instanceof Error ? caughtError.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

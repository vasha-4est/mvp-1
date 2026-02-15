import { randomUUID } from "crypto";

import { NextResponse } from "next/server";

import { callGas } from "../../../lib/integrations/gasClient";

type BatchRow = {
  id: string;
  code: string;
  status: string;
  created_at: string;
  request_id?: string;
  note?: string;
};

type BatchListFilters = {
  status?: string;
  fromDate?: string;
  toDate?: string;
  prefix?: string;
};

const YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/;

function normalizeErrorMessage(rawError: unknown, fallback: string): string {
  if (typeof rawError === "string") return rawError;
  if (rawError) return JSON.stringify(rawError);
  return fallback;
}

function parseDateParam(name: "fromDate" | "toDate", value: string | null): { value?: string; error?: string } {
  if (!value) return {};

  const trimmed = value.trim();
  if (!YYYY_MM_DD.test(trimmed)) {
    return { error: `Invalid '${name}' format. Expected YYYY-MM-DD` };
  }

  const parsed = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return { error: `Invalid '${name}' date value` };
  }

  return { value: trimmed };
}

function mapErrorToStatus(errorMessage: string): number {
  const normalized = errorMessage.toLowerCase();

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

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);

  const status = url.searchParams.get("status")?.trim();
  const prefix = url.searchParams.get("prefix")?.trim();

  const parsedFrom = parseDateParam("fromDate", url.searchParams.get("fromDate"));
  if (parsedFrom.error) {
    return NextResponse.json({ ok: false, error: parsedFrom.error }, { status: 400 });
  }

  const parsedTo = parseDateParam("toDate", url.searchParams.get("toDate"));
  if (parsedTo.error) {
    return NextResponse.json({ ok: false, error: parsedTo.error }, { status: 400 });
  }

  if (parsedFrom.value && parsedTo.value && parsedFrom.value > parsedTo.value) {
    return NextResponse.json(
      { ok: false, error: "Invalid date range: 'fromDate' must be <= 'toDate'" },
      { status: 400 }
    );
  }

  const filters: BatchListFilters = {
    ...(status ? { status } : {}),
    ...(parsedFrom.value ? { fromDate: parsedFrom.value } : {}),
    ...(parsedTo.value ? { toDate: parsedTo.value } : {}),
    ...(prefix ? { prefix } : {}),
  };

  try {
    const gasResponse = await callGas<BatchRow[]>("batch_list", filters, randomUUID());
    if (!gasResponse.ok) {
      const rawErr: unknown = (gasResponse as unknown as { error?: unknown }).error;
      const error = normalizeErrorMessage(rawErr, "GAS batch_list failed");
      return NextResponse.json({ ok: false, error }, { status: mapErrorToStatus(error) });
    }

    return NextResponse.json({ ok: true, data: gasResponse.data ?? [] }, { status: 200 });
  } catch (caughtError) {
    const message = caughtError instanceof Error ? caughtError.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

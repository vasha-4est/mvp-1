import { randomUUID } from "crypto";

import { NextResponse } from "next/server";

import { callGas } from "../../../../lib/integrations/gasClient";

type BatchCreatePayload = {
  code: string;
  note?: string;
  meta?: Record<string, unknown>;
};

type BatchCreateResult = {
  id: string;
  code: string;
  status: string;
  created_at: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validatePayload(body: unknown): { payload?: BatchCreatePayload; error?: string } {
  if (!isRecord(body)) {
    return { error: "Body must be a JSON object" };
  }

  if (typeof body.code !== "string" || body.code.trim().length === 0) {
    return { error: "Field 'code' is required and must be a non-empty string" };
  }

  if (body.note !== undefined && typeof body.note !== "string") {
    return { error: "Field 'note' must be a string when provided" };
  }

  if (body.meta !== undefined && !isRecord(body.meta)) {
    return { error: "Field 'meta' must be an object when provided" };
  }

  return {
    payload: {
      code: body.code.trim(),
      ...(body.note !== undefined ? { note: body.note } : {}),
      ...(body.meta !== undefined ? { meta: body.meta } : {}),
    },
  };
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const { payload, error } = validatePayload(body);
  if (!payload) {
    return NextResponse.json({ ok: false, error }, { status: 400 });
  }

  const requestId =
    isRecord(body) && typeof body.request_id === "string" && body.request_id.trim().length > 0
      ? body.request_id.trim()
      : randomUUID();

  try {
    const gasResponse = await callGas<BatchCreateResult>("batch_create", payload, requestId);

    if (!gasResponse.ok || !gasResponse.data) {
      const errorMessage = gasResponse.error ?? "GAS batch_create failed";
      const status = errorMessage.includes("timed out") ? 503 : 502;

      return NextResponse.json(
        {
          ok: false,
          error: errorMessage,
          gas: gasResponse,
          request_id: requestId,
        },
        { status }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        batch: gasResponse.data,
        request_id: requestId,
      },
      { status: 201 }
    );
  } catch (caughtError) {
    return NextResponse.json(
      {
        ok: false,
        error:
          caughtError instanceof Error
            ? caughtError.message
            : "Unknown error while creating batch",
        request_id: requestId,
      },
      { status: 503 }
    );
  }
}

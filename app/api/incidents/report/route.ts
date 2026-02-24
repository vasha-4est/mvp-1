import { NextResponse } from "next/server";

import { statusForErrorCode } from "@/lib/api/gasError";
import { parseReportBody, reportIncident } from "@/lib/incidents/service";
import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { requireAnyRole } from "@/lib/server/guards";

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: {
      [REQUEST_ID_HEADER]: requestId,
    },
  });
}

export async function POST(request: Request) {
  const auth = requireAnyRole(request, ["OWNER", "COO"]);
  if (auth.ok === false) {
    return auth.response;
  }

  const requestId = auth.requestId;

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return json(requestId, 400, {
      ok: false,
      error: "Invalid JSON body",
      code: "VALIDATION_ERROR",
    });
  }

  const parsed = parseReportBody(payload);
  if (parsed.ok === false) {
    return json(requestId, statusForErrorCode(parsed.code), {
      ok: false,
      error: parsed.error,
      code: parsed.code,
    });
  }

  try {
    const result = await reportIncident({
      requestId,
      severity: parsed.data.severity,
      zone: parsed.data.zone,
      entity_type: parsed.data.entity_type,
      entity_id: parsed.data.entity_id,
      title: parsed.data.title,
      description: parsed.data.description,
      proof_ref: parsed.data.proof_ref,
    });

    if (result.ok === false) {
      return json(requestId, statusForErrorCode(result.code), {
        ok: false,
        error: result.error,
        code: result.code,
        ...(result.details ? { details: result.details } : {}),
      });
    }

    return json(requestId, 201, {
      ok: true,
      incident_id: result.incident_id,
    });
  } catch {
    return json(requestId, 502, {
      ok: false,
      error: "Bad gateway",
      code: "BAD_GATEWAY",
    });
  }
}

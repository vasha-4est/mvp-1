import { NextResponse } from "next/server";

import { logJson } from "./logger";
import { REQUEST_ID_HEADER } from "./requestId";

type ApiLogMeta = {
  code?: string;
  actor?: string;
  startedAt: number;
  path: string;
  requestId: string;
  method: string;
};

export function withApiLog(response: NextResponse, meta: ApiLogMeta): NextResponse {
  response.headers.set(REQUEST_ID_HEADER, meta.requestId);

  const latencyMs = Math.max(0, Date.now() - meta.startedAt);
  const status = response.status;

  logJson({
    ts: new Date().toISOString(),
    request_id: meta.requestId,
    method: meta.method,
    path: meta.path,
    status,
    latency_ms: latencyMs,
    ok: status < 400,
    ...(meta.code ? { code: meta.code } : {}),
    ...(meta.actor ? { actor: meta.actor } : {}),
  });

  return response;
}

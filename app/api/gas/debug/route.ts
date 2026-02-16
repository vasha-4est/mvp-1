import { NextResponse } from "next/server";

import { withApiLog } from "../../../../lib/obs/apiLog";
import { getOrCreateRequestId } from "../../../../lib/obs/requestId";

/**
 * Temporary GAS debug endpoint to inspect raw WebApp response text/headers.
 */
export async function GET(request: Request) {
  const startedAt = Date.now();
  const requestId = getOrCreateRequestId(request);
  const path = new URL(request.url).pathname;
  const actor = "service";

  const finalize = (response: NextResponse, code?: string) =>
    withApiLog(response, {
      startedAt,
      requestId,
      method: request.method,
      path,
      actor,
      ...(code ? { code } : {}),
    });

  const gasUrl = process.env.GAS_WEBAPP_URL;
  const gasApiKey = process.env.GAS_API_KEY;

  if (!gasUrl) {
    return finalize(NextResponse.json({ ok: false, error: "Missing GAS_WEBAPP_URL" }, { status: 500 }));
  }

  const response = await fetch(gasUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-request-id": requestId,
    },
    body: JSON.stringify({
      action: "ping",
      payload: {},
      request_id: requestId,
      auth: gasApiKey ? { api_key: gasApiKey } : undefined,
    }),
  });

  const rawText = await response.text();

  return finalize(
    NextResponse.json({
      ok: true,
      gas_http_status: response.status,
      gas_content_type: response.headers.get("content-type"),
      gas_text_head: rawText.slice(0, 800),
      gas_text_len: rawText.length,
      has_env_gas_api_key: Boolean(gasApiKey),
      env_gas_api_key_len: gasApiKey ? gasApiKey.length : 0,
    })
  );
}

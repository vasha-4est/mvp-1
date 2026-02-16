import { NextResponse } from "next/server";

import { callGas } from "../../../../lib/integrations/gasClient";
import { withApiLog } from "../../../../lib/obs/apiLog";
import { getOrCreateRequestId } from "../../../../lib/obs/requestId";

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

  try {
    const gasResponse = await callGas("ping", {}, requestId);

    if (gasResponse.ok) {
      return finalize(NextResponse.json({ ok: true, gas: gasResponse }));
    }

    return finalize(
      NextResponse.json({
        ok: false,
        error: gasResponse.error ?? "GAS health check failed",
        gas: gasResponse,
      })
    );
  } catch (error) {
    return finalize(
      NextResponse.json({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown GAS health check error",
      })
    );
  }
}

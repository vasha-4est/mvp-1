import { NextResponse } from "next/server";

import { callGas } from "../../../../lib/integrations/gasClient";

export async function GET() {
  const requestId = `health-${Date.now()}`;

  try {
    const gasResponse = await callGas("ping", {}, requestId);

    if (gasResponse.ok) {
      return NextResponse.json({ ok: true, gas: gasResponse });
    }

    return NextResponse.json({
      ok: false,
      error: gasResponse.error ?? "GAS health check failed",
      gas: gasResponse,
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Unknown GAS health check error",
    });
  }
}

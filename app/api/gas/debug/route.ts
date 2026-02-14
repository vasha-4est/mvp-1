import { NextResponse } from "next/server";

/**
 * Temporary GAS debug endpoint to inspect raw WebApp response text/headers.
 */
export async function GET() {
  const gasUrl = process.env.GAS_WEBAPP_URL;

  if (!gasUrl) {
    return NextResponse.json({ ok: false, error: "Missing GAS_WEBAPP_URL" }, { status: 500 });
  }

  const response = await fetch(gasUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "ping",
      payload: {},
      request_id: "debug-from-server",
    }),
  });

  const rawText = await response.text();

  return NextResponse.json({
    ok: true,
    gas_http_status: response.status,
    gas_content_type: response.headers.get("content-type"),
    gas_text_head: rawText.slice(0, 800),
    gas_text_len: rawText.length,
  });
}

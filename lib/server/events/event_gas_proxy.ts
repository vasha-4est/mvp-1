// event_gas_proxy.ts
// Direct GAS integration (no proxy). Sends events to GAS Web App.

import type { TargetEvent } from "./event_validator";

export interface GasWriteResponse {
  ok: boolean;
  status: number;
  body?: unknown;
}

// Helper to get env variables safely
function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export async function writeEventToGAS(event: TargetEvent): Promise<GasWriteResponse> {
  const url = getRequiredEnv("GAS_WEBAPP_URL"); // actually GAS Web App URL (нужна новая переменная Vercel = GAS_PROXY_BASE_URL)
  const apiKey = getRequiredEnv("GAS_API_KEY");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      event,
      api_key: apiKey
    }),
    cache: "no-store"
  });

  let body: unknown;
  const text = await response.text();

  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = text;
  }

  if (!response.ok) {
    throw new Error(
      `GAS_WRITE_FAILED: ${response.status} ${
        typeof body === "string" ? body : JSON.stringify(body)
      }`
    );
  }

  return {
    ok: true,
    status: response.status,
    body
  };
}

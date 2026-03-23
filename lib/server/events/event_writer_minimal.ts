// event_writer.ts
// Minimal production-ready event writer (GAS integration)

import { normalizeEvent } from "./event_adapter";

type AnyObject = { [key: string]: any };

interface TargetEvent {
  event_id: string;
  event_type: string;
  entity_type: string;
  entity_id: string;
  payload_json: AnyObject;
  created_at: string;
  created_by_employee_id?: string;
  severity?: "info" | "important" | "critical";
  source?: string;
  request_id?: string;
}

// In-memory idempotency cache (MVP only)
const idempotencyCache = new Set<string>();

export async function createEvent(rawEvent: AnyObject): Promise<TargetEvent> {
  const event = normalizeEvent(rawEvent);

  // Idempotency (basic)
  if (event.request_id && idempotencyCache.has(event.request_id)) {
    return event;
  }

  if (event.request_id) {
    idempotencyCache.add(event.request_id);
  }

  validateEvent(event);

  await sendToGAS(event);

  return event;
}

function validateEvent(event: TargetEvent) {
  if (!event.event_type) throw new Error("event_type is required");
  if (!event.entity_type) throw new Error("entity_type is required");
  if (!event.entity_id) throw new Error("entity_id is required");
  if (!event.created_at) throw new Error("created_at is required");
}

async function sendToGAS(event: TargetEvent) {
  const url = process.env.GAS_WEBAPP_URL;

  if (!url) {
    throw new Error("GAS_WEBAPP_URL is not set");
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "event.write",
      payload: event,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GAS write failed: ${res.status} ${text}`);
  }
}

// event_writer.ts
// Canonical writer for events (target schema)

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

// In-memory idempotency cache (replace with DB later)
const idempotencyCache = new Set<string>();

export function createEvent(rawEvent: AnyObject): TargetEvent {
  const event = normalizeEvent(rawEvent);

  // Idempotency check
  if (event.request_id && idempotencyCache.has(event.request_id)) {
    return event;
  }

  if (event.request_id) {
    idempotencyCache.add(event.request_id);
  }

  // Validation (basic)
  validateEvent(event);

  // Write (stub — replace with GAS/API integration)
  logEvent(event);

  return event;
}

function validateEvent(event: TargetEvent) {
  if (!event.event_type) throw new Error("event_type is required");
  if (!event.entity_type) throw new Error("entity_type is required");
  if (!event.entity_id) throw new Error("entity_id is required");
  if (!event.created_at) throw new Error("created_at is required");
}

function logEvent(event: TargetEvent) {
  // Replace with real persistence layer
  console.log("[EVENT]", JSON.stringify(event, null, 2));
}

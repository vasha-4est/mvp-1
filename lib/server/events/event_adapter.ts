// event_adapter.ts
// Adapter to normalize legacy events into target schema

type AnyObject = { [key: string]: any };

export interface TargetEvent {
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

// Mapping functions

function normalizeEventType(type: string): string {
  if (!type) return "unknown_event";

  const map: Record<string, string> = {
    "inventory.move": "inventory_moved",
    "inventory.received": "inventory_received",
    "picking.confirm": "picking_confirmed",
    "ship_dispatched": "shipment_shipped",
    "batch_status_changed": "batch_updated",
    "users_directory_cache_refreshed": "system_event"
  };

  return map[type] || type.replace(".", "_");
}

function normalizeEntityType(objType?: string): string {
  if (!objType) return "unknown";

  const map: Record<string, string> = {
    "batch": "batch",
    "inventory": "inventory",
    "picking": "picking_list",
    "shipment": "shipment",
    "user": "user"
  };

  return map[objType] || objType;
}

// Main adapter

export function normalizeEvent(event: AnyObject): TargetEvent {
  const event_type = normalizeEventType(event.event_key || event.type);
  const entity_type = normalizeEntityType(event.object_type);

  const entity_id =
    event.object_id ||
    event.batch_id ||
    event.batch_code ||
    event.entity_id ||
    "unknown";

  const created_at =
    event.server_ts ||
    event.at ||
    new Date().toISOString();

  return {
    event_id: event.event_id || generateEventId(),
    event_type,
    entity_type,
    entity_id,
    payload_json: event.payload_json || event.details_json || {},
    created_at,
    created_by_employee_id:
      event.actor_employee_id || event.actor || undefined,
    severity: event.severity || "info",
    source: event.source || "system",
    request_id: event.request_id || undefined
  };
}

// Simple event id generator (fallback)

function generateEventId(): string {
  return "EV-" + Date.now() + "-" + Math.floor(Math.random() * 100000);
}

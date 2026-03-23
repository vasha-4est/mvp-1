// event_validator.ts
// Dependency-free validator for target event contract (MVP-1)

export type EventSeverity = "info" | "important" | "critical";
export type EventSource = "webapp" | "bot" | "system" | "api" | "migration" | "admin";

export interface TargetEvent {
  event_id: string;
  event_type: string;
  entity_type: string;
  entity_id: string;
  payload_json: Record<string, unknown>;
  created_at: string;
  created_by_employee_id?: string;
  severity?: EventSeverity;
  source?: EventSource | string;
  request_id?: string;
}

export interface ValidationIssue {
  field: string;
  code: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

const ALLOWED_SEVERITIES = new Set<EventSeverity>(["info", "important", "critical"]);
const ALLOWED_SOURCES = new Set<EventSource>(["webapp", "bot", "system", "api", "migration", "admin"]);

const ALLOWED_EVENT_TYPES = new Set<string>([
  "user_logged_in",
  "user_logged_out",
  "user_login_failed",
  "login_failed_multiple",
  "user_created",
  "user_role_changed",
  "password_reset",
  "user_blocked",
  "user_unblocked",
  "impersonation_started",
  "impersonation_ended",
  "shift_started",
  "shift_paused",
  "shift_resumed",
  "shift_ended",
  "shift_no_show",
  "shift_planned",
  "floor_status_updated",
  "lock_acquired",
  "lock_released",
  "lock_expired",
  "lock_conflict",
  "task_created",
  "task_started",
  "task_paused",
  "task_completed",
  "task_blocked",
  "task_issue_reported",
  "task_timeout_triggered",
  "task_grace_extended",
  "task_escalated",
  "task_returned_to_pool",
  "batch_created",
  "batch_started",
  "batch_finished",
  "batch_moved",
  "batch_moved_to_drying",
  "batch_drying_started",
  "batch_drying_finished",
  "batch_moved_to_packaging",
  "batch_closed",
  "batch_defect_recorded",
  "materials_consumed",
  "packaging_started",
  "packaging_finished",
  "labeling_finished",
  "qc_started",
  "qc_checked",
  "qc_failed",
  "qc_passed",
  "defect_recorded",
  "inventory_received",
  "inventory_moved",
  "inventory_reserved",
  "inventory_released",
  "inventory_adjusted",
  "inventory_reserve_released",
  "picking_list_created",
  "picking_list_imported",
  "picking_list_status_changed",
  "picking_focus_set",
  "picking_scan_captured",
  "picking_created",
  "picking_reserved",
  "picking_started",
  "picking_scanned",
  "picking_confirmed",
  "picking_completed",
  "picking_line_completed",
  "picking_warehouse_closed",
  "picking_list_closed",
  "shipment_created",
  "shipment_updated",
  "shipment_ready",
  "shipment_confirmed",
  "shipment_shipped",
  "shipment_marked",
  "drying_started",
  "drying_progress_updated",
  "drying_completed",
  "incident_reported",
  "manual_entry_used",
  "daily_summary_generated",
  "tomorrow_plan_generated",
  "tomorrow_plan_overridden",
  "payroll_entry_created",
  "payroll_calculated",
  "payroll_confirmed",
  "payroll_line_created",
  "payroll_adjusted_manual_exception",
  "marketplace_penalty_added",
  "kpi_calculated",
  "kpi_threshold_exceeded",
  "sla_risk_detected",
  "bottleneck_detected",
  "wip_limit_reached",
  "recommendation_generated",
  "stop_triggered",
  "stop_acknowledged",
  "stop_resolved",
  "sop_changed",
  "decision_recorded",
  "system_error",
  "system_warning",
  "manual_refresh_triggered",
  "unauthorized_access_attempt"
]);

const ALLOWED_ENTITY_TYPES = new Set<string>([
  "user",
  "session",
  "impersonation_session",
  "shift",
  "employee",
  "lock",
  "work_item",
  "batch",
  "inventory",
  "inventory_reservation",
  "picking_list",
  "picking_line",
  "shipment",
  "drying",
  "qc_check",
  "incident",
  "payroll_period",
  "payroll_line",
  "kpi",
  "stop",
  "decision",
  "sop_change",
  "system"
]);

function isIsoDateTime(value: unknown): boolean {
  if (typeof value !== "string" || value.trim() === "") return false;
  const t = Date.parse(value);
  return Number.isFinite(t);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateEvent(event: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!isPlainObject(event)) {
    return {
      ok: false,
      issues: [{ field: "$", code: "INVALID_TYPE", message: "Event must be a plain object" }]
    };
  }

  const e = event as Record<string, unknown>;

  const requiredStringFields = [
    "event_id",
    "event_type",
    "entity_type",
    "entity_id",
    "created_at"
  ] as const;

  for (const field of requiredStringFields) {
    if (typeof e[field] !== "string" || (e[field] as string).trim() === "") {
      issues.push({
        field,
        code: "REQUIRED",
        message: `${field} is required and must be a non-empty string`
      });
    }
  }

  if (!isPlainObject(e.payload_json)) {
    issues.push({
      field: "payload_json",
      code: "INVALID_TYPE",
      message: "payload_json must be an object"
    });
  }

  if (typeof e.event_type === "string" && !ALLOWED_EVENT_TYPES.has(e.event_type)) {
    issues.push({
      field: "event_type",
      code: "INVALID_ENUM",
      message: `Unsupported event_type: ${e.event_type}`
    });
  }

  if (typeof e.entity_type === "string" && !ALLOWED_ENTITY_TYPES.has(e.entity_type)) {
    issues.push({
      field: "entity_type",
      code: "INVALID_ENUM",
      message: `Unsupported entity_type: ${e.entity_type}`
    });
  }

  if (e.severity !== undefined) {
    if (typeof e.severity !== "string" || !ALLOWED_SEVERITIES.has(e.severity as EventSeverity)) {
      issues.push({
        field: "severity",
        code: "INVALID_ENUM",
        message: `severity must be one of: ${Array.from(ALLOWED_SEVERITIES).join(", ")}`
      });
    }
  }

  if (e.source !== undefined) {
    if (typeof e.source !== "string" || !ALLOWED_SOURCES.has(e.source as EventSource)) {
      issues.push({
        field: "source",
        code: "INVALID_ENUM",
        message: `source must be one of: ${Array.from(ALLOWED_SOURCES).join(", ")}`
      });
    }
  }

  if (!isIsoDateTime(e.created_at)) {
    issues.push({
      field: "created_at",
      code: "INVALID_DATETIME",
      message: "created_at must be a valid ISO datetime string"
    });
  }

  if (e.request_id !== undefined && typeof e.request_id !== "string") {
    issues.push({
      field: "request_id",
      code: "INVALID_TYPE",
      message: "request_id must be a string when provided"
    });
  }

  if (e.created_by_employee_id !== undefined && typeof e.created_by_employee_id !== "string") {
    issues.push({
      field: "created_by_employee_id",
      code: "INVALID_TYPE",
      message: "created_by_employee_id must be a string when provided"
    });
  }

  return { ok: issues.length === 0, issues };
}

export function assertValidEvent(event: unknown): asserts event is TargetEvent {
  const result = validateEvent(event);
  if (!result.ok) {
    const message = result.issues.map((i) => `${i.field}: ${i.message}`).join("; ");
    throw new Error(`EVENT_VALIDATION_FAILED: ${message}`);
  }
}

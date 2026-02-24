import { parseErrorPayload } from "@/lib/api/gasError";
import { callGas } from "@/lib/integrations/gasClient";

const ALLOWED_SEVERITIES = ["low", "medium", "high"] as const;

export type IncidentSeverity = (typeof ALLOWED_SEVERITIES)[number];

type GasIncident = {
  incident_id?: unknown;
  type?: unknown;
  severity?: unknown;
  message?: unknown;
  created_at?: unknown;
  created_by?: unknown;
};

type GasIncidentListResult = {
  items?: GasIncident[];
};

type ServiceError = {
  ok: false;
  error: string;
  code: string;
  details?: Record<string, unknown>;
};

type ListIncidentsSuccess = {
  ok: true;
  items: Array<{
    incident_id: string;
    type: string;
    severity: IncidentSeverity;
    message: string;
    created_at: string;
    created_by: string;
  }>;
};

type ReportIncidentSuccess = {
  ok: true;
  incident_id: string;
};

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSeverity(value: unknown): IncidentSeverity {
  const candidate = normalizeText(value).toLowerCase();
  if (ALLOWED_SEVERITIES.includes(candidate as IncidentSeverity)) {
    return candidate as IncidentSeverity;
  }

  return "low";
}

function normalizeIso(value: unknown): string {
  const raw = normalizeText(value);
  const parsed = Date.parse(raw);
  if (!raw || !Number.isFinite(parsed)) {
    return new Date(0).toISOString();
  }

  return new Date(parsed).toISOString();
}

function toServiceError(rawError: unknown, fallback: string): ServiceError {
  if (!rawError) {
    return { ok: false, error: fallback, code: "BAD_GATEWAY" };
  }

  const parsed = parseErrorPayload(rawError);
  return {
    ok: false,
    error: parsed.error || fallback,
    code: parsed.code || "BAD_GATEWAY",
    ...(parsed.details ? { details: parsed.details } : {}),
  };
}

export async function listIncidents(requestId: string, limit: number): Promise<ListIncidentsSuccess | ServiceError> {
  const gasResponse = await callGas<GasIncidentListResult>("incidents.list", { limit }, requestId);

  if (!gasResponse.ok || !gasResponse.data) {
    return toServiceError(gasResponse.error, "Failed to list incidents");
  }

  const rawItems = Array.isArray(gasResponse.data.items) ? gasResponse.data.items : [];
  const items = rawItems
    .map((item) => {
      const incidentId = normalizeText(item.incident_id);
      const type = normalizeText(item.type);
      const message = normalizeText(item.message);
      const createdBy = normalizeText(item.created_by);

      if (!incidentId || !type || !message || !createdBy) {
        return null;
      }

      return {
        incident_id: incidentId,
        type,
        severity: normalizeSeverity(item.severity),
        message,
        created_at: normalizeIso(item.created_at),
        created_by: createdBy,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return { ok: true, items };
}

export async function reportIncident(input: {
  requestId: string;
  type: string;
  severity: IncidentSeverity;
  message: string;
  meta: Record<string, unknown>;
  createdBy: string;
}): Promise<ReportIncidentSuccess | ServiceError> {
  const reportResponse = await callGas<{ incident_id?: unknown }>(
    "incidents.report",
    {
      type: input.type,
      severity: input.severity,
      message: input.message,
      meta: input.meta,
      created_by: input.createdBy,
    },
    input.requestId
  );

  if (!reportResponse.ok || !reportResponse.data) {
    return toServiceError(reportResponse.error, "Failed to report incident");
  }

  const incidentId = normalizeText(reportResponse.data.incident_id);
  if (!incidentId) {
    return {
      ok: false,
      error: "Failed to report incident",
      code: "BAD_GATEWAY",
    };
  }

  await callGas<unknown>(
    "events_log.append",
    {
      event_name: "incident_reported",
      incident_id: incidentId,
      type: input.type,
      severity: input.severity,
      created_by: input.createdBy,
      at: new Date().toISOString(),
    },
    input.requestId
  ).catch(() => undefined);

  return {
    ok: true,
    incident_id: incidentId,
  };
}

export function parseLimit(value: string | null): number {
  if (!value) return 50;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 50;
  return Math.min(parsed, 200);
}

export function parseReportBody(body: unknown):
  | {
      ok: true;
      data: {
        type: string;
        severity: IncidentSeverity;
        message: string;
        meta: Record<string, unknown>;
      };
    }
  | ServiceError {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return {
      ok: false,
      error: "Body must be a JSON object",
      code: "VALIDATION_ERROR",
    };
  }

  const payload = body as {
    type?: unknown;
    severity?: unknown;
    message?: unknown;
    meta?: unknown;
  };

  const type = normalizeText(payload.type);
  const message = normalizeText(payload.message);
  const severity = normalizeText(payload.severity).toLowerCase();

  if (!type) {
    return { ok: false, error: "Field 'type' is required", code: "VALIDATION_ERROR" };
  }

  if (!message) {
    return { ok: false, error: "Field 'message' is required", code: "VALIDATION_ERROR" };
  }

  if (!ALLOWED_SEVERITIES.includes(severity as IncidentSeverity)) {
    return {
      ok: false,
      error: "Field 'severity' must be one of: low, medium, high",
      code: "VALIDATION_ERROR",
    };
  }

  const meta =
    typeof payload.meta === "object" && payload.meta !== null && !Array.isArray(payload.meta)
      ? (payload.meta as Record<string, unknown>)
      : {};

  return {
    ok: true,
    data: {
      type,
      severity: severity as IncidentSeverity,
      message,
      meta,
    },
  };
}

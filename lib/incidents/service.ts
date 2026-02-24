import { parseErrorPayload } from "@/lib/api/gasError";
import { callGas } from "@/lib/integrations/gasClient";

const ALLOWED_SEVERITIES = ["low", "medium", "high"] as const;

export type IncidentSeverity = (typeof ALLOWED_SEVERITIES)[number];

type GasIncident = {
  incident_id?: unknown;
  severity?: unknown;
  zone?: unknown;
  entity_type?: unknown;
  entity_id?: unknown;
  reported_by_user_id?: unknown;
  reported_by_role_id?: unknown;
  status?: unknown;
  title?: unknown;
  description?: unknown;
  proof_ref?: unknown;
  created_at?: unknown;
  closed_at?: unknown;
  owner_role_id?: unknown;
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
    severity: IncidentSeverity;
    zone: string;
    entity_type: string;
    entity_id: string;
    reported_by_user_id: string;
    reported_by_role_id: string;
    status: string;
    title: string;
    description: string;
    proof_ref: string;
    created_at: string;
    closed_at: string;
    owner_role_id: string;
  }>;
};

type ReportIncidentSuccess = {
  ok: true;
  incident_id: string;
};

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSeverity(value: unknown): IncidentSeverity | null {
  const candidate = normalizeText(value).toLowerCase();
  if (ALLOWED_SEVERITIES.includes(candidate as IncidentSeverity)) {
    return candidate as IncidentSeverity;
  }

  return null;
}

function normalizeIsoOrEmpty(value: unknown): string {
  const raw = normalizeText(value);
  if (!raw) {
    return "";
  }

  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) {
    return "";
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
      const severity = normalizeSeverity(item.severity);
      const zone = normalizeText(item.zone);
      const entityType = normalizeText(item.entity_type);
      const entityId = normalizeText(item.entity_id);
      const reportedByUserId = normalizeText(item.reported_by_user_id);
      const reportedByRoleId = normalizeText(item.reported_by_role_id);
      const status = normalizeText(item.status);
      const title = normalizeText(item.title);
      const description = normalizeText(item.description);

      if (
        !incidentId ||
        !severity ||
        !zone ||
        !entityType ||
        !entityId ||
        !reportedByUserId ||
        !reportedByRoleId ||
        !status ||
        !title ||
        !description
      ) {
        return null;
      }

      return {
        incident_id: incidentId,
        severity,
        zone,
        entity_type: entityType,
        entity_id: entityId,
        reported_by_user_id: reportedByUserId,
        reported_by_role_id: reportedByRoleId,
        status,
        title,
        description,
        proof_ref: normalizeText(item.proof_ref),
        created_at: normalizeIsoOrEmpty(item.created_at),
        closed_at: normalizeIsoOrEmpty(item.closed_at),
        owner_role_id: normalizeText(item.owner_role_id),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return { ok: true, items };
}

export async function reportIncident(input: {
  requestId: string;
  severity: IncidentSeverity;
  zone: string;
  entity_type: string;
  entity_id: string;
  title: string;
  description: string;
  proof_ref: string;
}): Promise<ReportIncidentSuccess | ServiceError> {
  const reportResponse = await callGas<{ incident_id?: unknown }>(
    "incidents.report",
    {
      severity: input.severity,
      zone: input.zone,
      entity_type: input.entity_type,
      entity_id: input.entity_id,
      title: input.title,
      description: input.description,
      proof_ref: input.proof_ref,
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
        severity: IncidentSeverity;
        zone: string;
        entity_type: string;
        entity_id: string;
        title: string;
        description: string;
        proof_ref: string;
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
    severity?: unknown;
    zone?: unknown;
    entity_type?: unknown;
    entity_id?: unknown;
    title?: unknown;
    description?: unknown;
    proof_ref?: unknown;
  };

  const severity = normalizeText(payload.severity).toLowerCase();
  const zone = normalizeText(payload.zone);
  const entityType = normalizeText(payload.entity_type);
  const entityId = normalizeText(payload.entity_id);
  const title = normalizeText(payload.title);
  const description = normalizeText(payload.description);
  const proofRef = normalizeText(payload.proof_ref);

  if (!ALLOWED_SEVERITIES.includes(severity as IncidentSeverity)) {
    return {
      ok: false,
      error: "Field 'severity' must be one of: low, medium, high",
      code: "VALIDATION_ERROR",
    };
  }

  if (!zone) {
    return { ok: false, error: "Field 'zone' is required", code: "VALIDATION_ERROR" };
  }

  if (!entityType) {
    return { ok: false, error: "Field 'entity_type' is required", code: "VALIDATION_ERROR" };
  }

  if (!entityId) {
    return { ok: false, error: "Field 'entity_id' is required", code: "VALIDATION_ERROR" };
  }

  if (!title) {
    return { ok: false, error: "Field 'title' is required", code: "VALIDATION_ERROR" };
  }

  if (!description) {
    return { ok: false, error: "Field 'description' is required", code: "VALIDATION_ERROR" };
  }

  return {
    ok: true,
    data: {
      severity: severity as IncidentSeverity,
      zone,
      entity_type: entityType,
      entity_id: entityId,
      title,
      description,
      proof_ref: proofRef,
    },
  };
}

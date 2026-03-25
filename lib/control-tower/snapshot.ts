import { parseErrorPayload, type ParsedGasError } from "@/lib/api/gasError";
import { callGas } from "@/lib/integrations/gasClient";
import { getShipmentsReadiness, type ShipmentReadinessItem } from "@/lib/shipments/readiness";

type ShipmentReadinessSummary = {
  total: number;
  ready: number;
  partial_ready: number;
  not_ready: number;
  sla_risk: number;
};

type ShipmentReadinessPriorityItem = Pick<
  ShipmentReadinessItem,
  | "shipment_id"
  | "status"
  | "readiness_percent"
  | "deadline_at"
  | "eta_at"
  | "sla_risk"
  | "sla_risk_reason"
  | "risk_level"
>;

type ShipmentReadinessSection = {
  generated_at: string;
  import_batch_id: string | null;
  summary: ShipmentReadinessSummary;
  priorities: {
    at_risk: ShipmentReadinessPriorityItem[];
    needs_attention: ShipmentReadinessPriorityItem[];
  };
  error: { code: "SHIPMENT_READINESS_FETCH_FAILED" } | null;
};

export type ControlTowerSnapshot = {
  ok: true;
  generated_at: string;
  sections: {
    deficit: Record<string, unknown>;
    shipments_readiness: Array<Record<string, unknown>>;
    inventory: {
      top_available: Array<Record<string, unknown>>;
      top_reserved: Array<Record<string, unknown>>;
      low_stock: Array<Record<string, unknown>>;
      updated_at_max: string | null;
    };
    picking: {
      open_lists: number;
      open_lines: number | null;
      last_created_at: string | null;
    };
    incidents: {
      open_total: number;
      by_severity: { low: number; medium: number; high: number; critical: number };
      by_zone: Record<string, number>;
    };
    locks: {
      active_total: number;
      by_entity_type: Record<string, number>;
      sample: Array<Record<string, unknown>>;
    };
    recent_events: Array<Record<string, unknown>>;
    shipment_readiness: ShipmentReadinessSection;
  };
};

type ControlTowerResult =
  | { ok: true; data: ControlTowerSnapshot }
  | ({ ok: false } & ParsedGasError);

function normalizeError(error: unknown, fallback: string): ParsedGasError {
  const parsed = parseErrorPayload(error);
  return {
    ...parsed,
    error: parsed.error || fallback,
  };
}

function emptyShipmentReadinessSummary(): ShipmentReadinessSummary {
  return {
    total: 0,
    ready: 0,
    partial_ready: 0,
    not_ready: 0,
    sla_risk: 0,
  };
}

function createShipmentReadinessFallback(): ShipmentReadinessSection {
  return {
    generated_at: new Date().toISOString(),
    import_batch_id: null,
    summary: emptyShipmentReadinessSummary(),
    priorities: {
      at_risk: [],
      needs_attention: [],
    },
    error: {
      code: "SHIPMENT_READINESS_FETCH_FAILED",
    },
  };
}

function isShipmentStatus(value: unknown): value is ShipmentReadinessItem["status"] {
  return value === "ready" || value === "partial_ready" || value === "not_ready";
}

function isShipmentRiskReason(value: unknown): value is ShipmentReadinessItem["sla_risk_reason"] {
  return (
    value === null ||
    value === "deadline_passed_not_ready" ||
    value === "eta_after_deadline" ||
    value === "near_deadline_partial_ready"
  );
}

function isRiskLevel(value: unknown): value is ShipmentReadinessItem["risk_level"] {
  return value === "normal" || value === "warning";
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isShipmentReadinessItem(value: unknown): value is ShipmentReadinessItem {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as Record<string, unknown>;

  return (
    typeof item.shipment_id === "string" &&
    isShipmentStatus(item.status) &&
    isNullableString(item.deadline_at) &&
    typeof item.readiness_percent === "number" &&
    isNullableString(item.eta_at) &&
    typeof item.sla_risk === "boolean" &&
    isShipmentRiskReason(item.sla_risk_reason) &&
    isRiskLevel(item.risk_level)
  );
}

function isShipmentReadinessPayload(
  value: unknown
): value is { generated_at: string; import_batch_id: string | null; shipments: ShipmentReadinessItem[] } {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Record<string, unknown>;
  return (
    typeof payload.generated_at === "string" &&
    (payload.import_batch_id === null || typeof payload.import_batch_id === "string") &&
    Array.isArray(payload.shipments) &&
    payload.shipments.every(isShipmentReadinessItem)
  );
}

function projectPriorityItem(item: ShipmentReadinessItem): ShipmentReadinessPriorityItem {
  return {
    shipment_id: item.shipment_id,
    status: item.status,
    readiness_percent: item.readiness_percent,
    deadline_at: item.deadline_at,
    eta_at: item.eta_at,
    sla_risk: item.sla_risk,
    sla_risk_reason: item.sla_risk_reason,
    risk_level: item.risk_level,
  };
}

function parseTimestamp(value: string | null): number {
  if (!value) {
    return Number.POSITIVE_INFINITY;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function compareShipmentPriority(left: ShipmentReadinessItem, right: ShipmentReadinessItem): number {
  const reasonRank = (value: ShipmentReadinessItem["sla_risk_reason"]) => {
    if (value === "deadline_passed_not_ready") return 0;
    if (value === "eta_after_deadline") return 1;
    if (value === "near_deadline_partial_ready") return 2;
    return 3;
  };

  return (
    reasonRank(left.sla_risk_reason) - reasonRank(right.sla_risk_reason) ||
    parseTimestamp(left.deadline_at) - parseTimestamp(right.deadline_at) ||
    left.readiness_percent - right.readiness_percent ||
    left.shipment_id.localeCompare(right.shipment_id)
  );
}

function summarizeShipments(shipments: ShipmentReadinessItem[]): ShipmentReadinessSummary {
  const summary = emptyShipmentReadinessSummary();

  for (const shipment of shipments) {
    summary.total += 1;

    if (shipment.status === "ready") summary.ready += 1;
    if (shipment.status === "partial_ready") summary.partial_ready += 1;
    if (shipment.status === "not_ready") summary.not_ready += 1;
    if (shipment.sla_risk) summary.sla_risk += 1;
  }

  return summary;
}

async function getShipmentReadinessSection(requestId: string): Promise<ShipmentReadinessSection> {
  const readiness = await getShipmentsReadiness(requestId);

  if (readiness.ok === false || !isShipmentReadinessPayload(readiness)) {
    return createShipmentReadinessFallback();
  }

  const atRisk = readiness.shipments
    .filter((shipment) => shipment.sla_risk)
    .sort(compareShipmentPriority)
    .slice(0, 5)
    .map(projectPriorityItem);

  const needsAttention = readiness.shipments
    .filter(
      (shipment) => shipment.status === "partial_ready" && shipment.sla_risk_reason === "near_deadline_partial_ready"
    )
    .sort(compareShipmentPriority)
    .slice(0, 5)
    .map(projectPriorityItem);

  return {
    generated_at: readiness.generated_at,
    import_batch_id: readiness.import_batch_id,
    summary: summarizeShipments(readiness.shipments),
    priorities: {
      at_risk: atRisk,
      needs_attention: needsAttention,
    },
    error: null,
  };
}

export async function getControlTowerSnapshot(requestId: string): Promise<ControlTowerResult> {
  const response = await callGas<ControlTowerSnapshot>("control_tower.read", {}, requestId, {
    timeoutMs: 25_000,
    retries: 1,
    retryBackoffMs: 500,
  });

  if (!response.ok || !response.data) {
    return {
      ok: false,
      ...normalizeError(response.error, "Failed to read control tower snapshot"),
    };
  }

  const shipmentReadiness = await getShipmentReadinessSection(requestId).catch(() => createShipmentReadinessFallback());

  return {
    ok: true,
    data: {
      ...response.data,
      sections: {
        ...response.data.sections,
        shipment_readiness: shipmentReadiness,
      },
    },
  };
}

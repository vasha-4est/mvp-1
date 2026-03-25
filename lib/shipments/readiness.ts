import { parseErrorPayload, type ParsedGasError } from "@/lib/api/gasError";
import { getInventoryBalances } from "@/lib/inventory/getInventoryBalances";
import { readLatestStagedShipmentPlanBatch } from "@/lib/shipmentPlan/readLatestStagedBatch";

export type ShipmentReadinessItem = {
  shipment_id: string;
  status: "not_ready" | "partial_ready" | "ready";
  planned_date: string | null;
  deadline_at: string | null;
  destination: string | null;
  progress: number;
  readiness_percent: number;
  eta_at: string | null;
  sla_risk: boolean;
  sla_risk_reason: "eta_after_deadline" | "near_deadline_partial_ready" | "deadline_passed_not_ready" | null;
  risk_level: "normal" | "warning";
  risk_reason: string | null;
  required_qty: number;
  available_qty: number;
  missing_qty: number;
  total_planned_qty: number;
  total_ready_qty: number;
  total_missing_qty: number;
};

type ShipmentReadinessResult =
  | { ok: true; generated_at: string; import_batch_id: string | null; shipments: ShipmentReadinessItem[] }
  | ({ ok: false } & ParsedGasError);

function normalizeNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function normalizeError(error: unknown, fallback: string): ParsedGasError {
  const parsed = parseErrorPayload(error);
  return {
    ...parsed,
    error: parsed.error || fallback,
  };
}

function clampProgress(requiredQty: number, availableQty: number): number {
  if (requiredQty <= 0) {
    return 0;
  }

  return Math.min(1, Math.max(0, availableQty / requiredQty));
}

function calculateStatus(progress: number): ShipmentReadinessItem["status"] {
  if (progress <= 0) {
    return "not_ready";
  }

  if (progress >= 1) {
    return "ready";
  }

  return "partial_ready";
}

function toIsoOrNull(date: Date): string | null {
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseDateOrNull(value: string | null): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function determineEta(status: ShipmentReadinessItem["status"], generatedAt: Date): string | null {
  if (status === "ready") {
    return generatedAt.toISOString();
  }

  if (status === "partial_ready") {
    return new Date(generatedAt.getTime() + 24 * 60 * 60 * 1000).toISOString();
  }

  return null;
}

function determineRiskReason(params: {
  status: ShipmentReadinessItem["status"];
  deadlineAt: string | null;
  etaAt: string | null;
  generatedAt: Date;
}): ShipmentReadinessItem["sla_risk_reason"] {
  const deadline = parseDateOrNull(params.deadlineAt);
  if (!deadline) {
    return null;
  }

  if (params.generatedAt.getTime() > deadline.getTime() && params.status !== "ready") {
    return "deadline_passed_not_ready";
  }

  const eta = parseDateOrNull(params.etaAt);
  if (eta && eta.getTime() > deadline.getTime()) {
    return "eta_after_deadline";
  }

  if (params.status === "partial_ready" && deadline.getTime() - params.generatedAt.getTime() < 24 * 60 * 60 * 1000) {
    return "near_deadline_partial_ready";
  }

  return null;
}

export async function getShipmentsReadiness(requestId: string): Promise<ShipmentReadinessResult> {
  const generatedAt = new Date();
  const planResponse = await readLatestStagedShipmentPlanBatch(requestId);
  if (planResponse.ok === false) {
    return planResponse;
  }

  if (planResponse.rows.length === 0) {
    return {
      ok: true,
      generated_at: generatedAt.toISOString(),
      import_batch_id: null,
      shipments: [],
    };
  }

  const balancesResponse = await getInventoryBalances(requestId);
  if (balancesResponse.ok === false) {
    return { ok: false, ...normalizeError(balancesResponse.error, "Failed to read inventory balances") };
  }

  const availableBySku = new Map<string, number>();
  for (const balance of balancesResponse.items) {
    if (!balance.sku_id) continue;
    availableBySku.set(balance.sku_id, (availableBySku.get(balance.sku_id) ?? 0) + normalizeNumber(balance.available_qty));
  }

  const grouped = new Map<
    string,
    {
      shipment_id: string;
      planned_date: string | null;
      deadline_at: string | null;
      destination: string | null;
      required_qty: number;
      available_qty: number;
    }
  >();

  for (const row of planResponse.rows) {
    const current = grouped.get(row.shipment_id) ?? {
      shipment_id: row.shipment_id,
      planned_date: row.planned_date,
      deadline_at: row.deadline_at,
      destination: row.destination,
      required_qty: 0,
      available_qty: 0,
    };

    const requiredQty = Math.max(0, normalizeNumber(row.planned_qty));
    const lineAvailableQty = Math.min(availableBySku.get(row.products_sku) ?? 0, requiredQty);

    current.planned_date = current.planned_date ?? row.planned_date;
    current.deadline_at = current.deadline_at ?? row.deadline_at;
    current.destination = current.destination ?? row.destination;
    current.required_qty += requiredQty;
    current.available_qty += lineAvailableQty;

    grouped.set(row.shipment_id, current);
  }

  const shipments = Array.from(grouped.values())
    .sort((left, right) => left.shipment_id.localeCompare(right.shipment_id))
    .map((shipment) => {
      const availableQty = Math.max(0, shipment.available_qty);
      const requiredQty = Math.max(0, shipment.required_qty);
      const missingQty = Math.max(0, requiredQty - availableQty);
      const progress = clampProgress(requiredQty, availableQty);
      const status = calculateStatus(progress);
      const etaAt = determineEta(status, generatedAt);
      const riskReason = determineRiskReason({
        status,
        deadlineAt: shipment.deadline_at,
        etaAt,
        generatedAt,
      });
      const riskLevel: ShipmentReadinessItem["risk_level"] = riskReason ? "warning" : "normal";

      return {
        shipment_id: shipment.shipment_id,
        status,
        planned_date: shipment.planned_date,
        deadline_at: shipment.deadline_at,
        destination: shipment.destination,
        progress,
        readiness_percent: Math.round(progress * 100),
        eta_at: etaAt,
        sla_risk: riskReason !== null,
        sla_risk_reason: riskReason,
        risk_level: riskLevel,
        risk_reason: riskReason,
        required_qty: requiredQty,
        available_qty: availableQty,
        missing_qty: missingQty,
        total_planned_qty: requiredQty,
        total_ready_qty: availableQty,
        total_missing_qty: missingQty,
      };
    });

  return {
    ok: true,
    generated_at: toIsoOrNull(generatedAt) ?? new Date().toISOString(),
    import_batch_id: planResponse.import_batch_id,
    shipments,
  };
}

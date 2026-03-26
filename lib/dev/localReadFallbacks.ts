import type { ControlTowerSnapshot } from "@/lib/control-tower/snapshot";
import type { LatestStagedShipmentPlanRow } from "@/lib/shipmentPlan/readLatestStagedBatch";

import { DEMO_PRODUCTION_PLAN } from "@/lib/dev/productionLaunchLocal";

export const DEV_FAST_FALLBACK_TIMEOUT_MS = 5000;

export function isDevFallbackEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}

export async function withDevFastTimeout<T>(promise: Promise<T>, fallbackValue: T, timeoutMs = DEV_FAST_FALLBACK_TIMEOUT_MS): Promise<T> {
  if (!isDevFallbackEnabled()) {
    return promise;
  }

  let timer: NodeJS.Timeout | null = null;

  try {
    return await Promise.race<T>([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallbackValue), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export function getLocalLatestShipmentPlanBatchFallback(): {
  import_batch_id: string;
  rows: LatestStagedShipmentPlanRow[];
} {
  return {
    import_batch_id: "IMP-PR118-DEMO-001",
    rows: [
      {
        import_batch_id: "IMP-PR118-DEMO-001",
        shipment_id: "SHP-PR118-001",
        planned_date: "2026-03-27",
        deadline_at: "2026-03-27T09:00:00.000Z",
        destination: "Moscow",
        products_sku: "OM-BM-Red(Dark)",
        planned_qty: 140,
        pasted_at: "2026-03-26T16:25:00.000Z",
        status: "staged",
      },
      {
        import_batch_id: "IMP-PR118-DEMO-001",
        shipment_id: "SHP-PR118-001",
        planned_date: "2026-03-27",
        deadline_at: "2026-03-27T09:00:00.000Z",
        destination: "Moscow",
        products_sku: "OM-BM-Brown(Dark)",
        planned_qty: 120,
        pasted_at: "2026-03-26T16:25:00.000Z",
        status: "staged",
      },
      {
        import_batch_id: "IMP-PR118-DEMO-001",
        shipment_id: "SHP-PR118-002",
        planned_date: "2026-03-27",
        deadline_at: "2026-03-27T15:00:00.000Z",
        destination: "Moscow",
        products_sku: "OM-BM-Brown(Mix)",
        planned_qty: 25,
        pasted_at: "2026-03-26T16:25:00.000Z",
        status: "staged",
      },
      {
        import_batch_id: "IMP-PR118-DEMO-001",
        shipment_id: "SHP-PR118-003",
        planned_date: "2026-03-28",
        deadline_at: "2026-03-28T13:00:00.000Z",
        destination: "Moscow",
        products_sku: "OM-BM-Mono(White)",
        planned_qty: 60,
        pasted_at: "2026-03-26T16:25:00.000Z",
        status: "staged",
      },
    ],
  };
}

export function getLocalControlTowerFallback(): ControlTowerSnapshot {
  return {
    ok: true,
    generated_at: new Date().toISOString(),
    sections: {
      deficit: {
        total_missing_qty: DEMO_PRODUCTION_PLAN.summary.production_qty,
        top_short_skus: DEMO_PRODUCTION_PLAN.items.map((item) => ({
          sku_id: item.sku_id,
          missing_qty: item.production_qty,
        })),
      },
      shipments_readiness: [],
      inventory: {
        top_available: [],
        top_reserved: [],
        low_stock: [],
        updated_at_max: null,
      },
      picking: {
        open_lists: 0,
        open_lines: 0,
        last_created_at: null,
      },
      incidents: {
        open_total: 0,
        by_severity: { low: 0, medium: 0, high: 0, critical: 0 },
        by_zone: {},
      },
      locks: {
        active_total: 0,
        by_entity_type: {},
        sample: [],
      },
      recent_events: [],
      shipment_readiness: {
        generated_at: new Date().toISOString(),
        import_batch_id: "IMP-PR118-DEMO-001",
        summary: {
          total: 0,
          ready: 0,
          partial_ready: 0,
          not_ready: 0,
          sla_risk: 0,
        },
        priorities: {
          at_risk: [],
          needs_attention: [],
        },
        error: {
          code: "SHIPMENT_READINESS_FETCH_FAILED",
        },
      },
      production_plan: {
        generated_at: new Date().toISOString(),
        import_batch_id: DEMO_PRODUCTION_PLAN.import_batch_id,
        summary: DEMO_PRODUCTION_PLAN.summary,
        items: DEMO_PRODUCTION_PLAN.items.map((item) => ({
          sku_id: item.sku_id,
          demand_qty: item.demand_qty,
          available_qty: item.available_qty,
          production_qty: item.production_qty,
          shipment_count: item.shipment_count,
          earliest_deadline_at: item.earliest_deadline_at,
          coverage_status: item.coverage_status,
          priority_reason: item.priority_reason,
        })),
        error: {
          code: "PRODUCTION_PLAN_FETCH_FAILED",
        },
      },
    },
  };
}

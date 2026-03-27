import { promises as fs } from "fs";

import type { ProductionLaunchItem, ProductionLaunchStatus } from "@/lib/productionLaunch/service";
import type { ProductionPlanPayload } from "@/lib/productionPlan/getProductionPlan";

const LOCAL_LAUNCH_STORE = "/tmp/mvp1_production_launch_state.json";

type LocalLaunchState = {
  items: ProductionLaunchItem[];
};

type WorkerItem = {
  id: string;
  username: string;
  roles: string[];
};

const DEMO_WORKERS: WorkerItem[] = [
  { id: "user_dasha_gorohova", username: "dasha_gorohova", roles: ["VIEWER"] },
  { id: "user_dima_kudryavtsev", username: "dima_kudryavtsev", roles: ["VIEWER"] },
  { id: "user_egor_pervyi", username: "egor_pervyi", roles: ["VIEWER"] },
  { id: "user_egor_vtoroi", username: "egor_vtoroi", roles: ["VIEWER"] },
  { id: "user_eva_pivovarova", username: "eva_pivovarova", roles: ["VIEWER"] },
  { id: "user_irina_m", username: "irina_m", roles: ["VIEWER"] },
  { id: "user_kristina_petrova", username: "kristina_petrova", roles: ["VIEWER"] },
  { id: "user_nastya_sintipuh", username: "nastya_sintipuh", roles: ["VIEWER"] },
  { id: "user_nikolay", username: "nikolay", roles: ["OWNER"] },
  { id: "user_sasha_rogulin", username: "sasha_rogulin", roles: ["VIEWER"] },
  { id: "user_valentina", username: "valentina", roles: ["VIEWER"] },
  { id: "user_vlad_scheglov", username: "vlad_scheglov", roles: ["VIEWER"] },
];

export const DEMO_PRODUCTION_PLAN: ProductionPlanPayload = {
  ok: true,
  generated_at: "2026-03-26T16:25:00.000Z",
  import_batch_id: "IMP-PR118-DEMO-001",
  summary: {
    shipment_count: 3,
    sku_count: 4,
    demand_qty: 345,
    available_qty: 251,
    covered_qty: 251,
    production_qty: 94,
    uncovered_qty: 94,
    urgent_skus: 4,
  },
  items: [
    {
      sku_id: "OM-BM-Red(Dark)",
      sku_name: "Organic Balm Red Dark",
      photo_url: null,
      demand_qty: 140,
      inventory_qty: 90,
      available_qty: 90,
      covered_qty: 90,
      production_qty: 50,
      shipment_count: 1,
      shipment_ids: ["SHP-PR118-001"],
      earliest_deadline_at: "2026-03-27T09:00:00.000Z",
      latest_deadline_at: "2026-03-27T09:00:00.000Z",
      coverage_status: "short",
      priority_reason: "Needs 50 before 2026-03-27T09:00:00.000Z",
    },
    {
      sku_id: "OM-BM-Brown(Dark)",
      sku_name: "Organic Balm Brown Dark",
      photo_url: null,
      demand_qty: 120,
      inventory_qty: 117,
      available_qty: 117,
      covered_qty: 117,
      production_qty: 3,
      shipment_count: 1,
      shipment_ids: ["SHP-PR118-001"],
      earliest_deadline_at: "2026-03-27T09:00:00.000Z",
      latest_deadline_at: "2026-03-27T09:00:00.000Z",
      coverage_status: "short",
      priority_reason: "Needs 3 before 2026-03-27T09:00:00.000Z",
    },
    {
      sku_id: "OM-BM-Brown(Mix)",
      sku_name: "Organic Balm Brown Mix",
      photo_url: null,
      demand_qty: 25,
      inventory_qty: 4,
      available_qty: 4,
      covered_qty: 4,
      production_qty: 21,
      shipment_count: 1,
      shipment_ids: ["SHP-PR118-002"],
      earliest_deadline_at: "2026-03-27T15:00:00.000Z",
      latest_deadline_at: "2026-03-27T15:00:00.000Z",
      coverage_status: "short",
      priority_reason: "Needs 21 before 2026-03-27T15:00:00.000Z",
    },
    {
      sku_id: "OM-BM-Mono(White)",
      sku_name: "Organic Balm Mono White",
      photo_url: null,
      demand_qty: 60,
      inventory_qty: 40,
      available_qty: 40,
      covered_qty: 40,
      production_qty: 20,
      shipment_count: 1,
      shipment_ids: ["SHP-PR118-003"],
      earliest_deadline_at: "2026-03-28T13:00:00.000Z",
      latest_deadline_at: "2026-03-28T13:00:00.000Z",
      coverage_status: "short",
      priority_reason: "Needs 20 before 2026-03-28T13:00:00.000Z",
    },
  ],
};

function isDevRuntime(): boolean {
  return process.env.NODE_ENV !== "production";
}

async function readStore(): Promise<LocalLaunchState> {
  try {
    const raw = await fs.readFile(LOCAL_LAUNCH_STORE, "utf8");
    const parsed = JSON.parse(raw) as LocalLaunchState;
    return { items: Array.isArray(parsed.items) ? parsed.items : [] };
  } catch {
    return { items: [] };
  }
}

async function writeStore(data: LocalLaunchState): Promise<void> {
  await fs.writeFile(LOCAL_LAUNCH_STORE, JSON.stringify(data, null, 2), "utf8");
}

function makeLocalBatchCode(): string {
  const now = new Date();
  const yy = String(now.getUTCFullYear()).slice(-2);
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const serial = String(Math.floor(100 + Math.random() * 900));
  return `B-${yy}${mm}${dd}-${serial}`;
}

export function getLocalWorkersFallback(): WorkerItem[] {
  return DEMO_WORKERS;
}

export function getLocalProductionPlanFallback(): ProductionPlanPayload {
  return {
    ...DEMO_PRODUCTION_PLAN,
    generated_at: new Date().toISOString(),
  };
}

export async function listLocalLaunchItems(importBatchId?: string): Promise<ProductionLaunchItem[]> {
  const store = await readStore();
  return store.items.filter((item) => (!importBatchId ? true : item.import_batch_id === importBatchId));
}

export async function updateLocalLaunchItem(input: {
  import_batch_id: string;
  sku_id: string;
  production_qty: number;
  done_qty?: number | null;
  demand_qty: number;
  shipment_count: number;
  shipment_ids?: string[];
  earliest_deadline_at: string | null;
  priority_reason: string;
  actor_user_id: string;
  actor_role_id: string;
  actor_username: string;
  update_action: "take" | "assign" | "status";
  assignee_user_id?: string | null;
  assignee_role_id?: string | null;
  assignee_username?: string | null;
  status?: ProductionLaunchStatus;
  blocked_reason?: string | null;
  batch_id?: string | null;
  batch_code?: string | null;
}): Promise<ProductionLaunchItem> {
  const store = await readStore();
  const key = `${input.import_batch_id}:${input.sku_id}`;
  const now = new Date().toISOString();
  const existing =
    store.items.find((item) => `${item.import_batch_id}:${item.sku_id}` === key) ??
    ({
      work_item_id: `prodlaunch_${input.import_batch_id}_${input.sku_id}`.replace(/[^A-Za-z0-9_-]+/g, "_"),
      import_batch_id: input.import_batch_id,
      sku_id: input.sku_id,
      status: "new",
      assignee_user_id: null,
      assignee_role_id: null,
      assignee_username: null,
      created_at: now,
      updated_at: now,
      taken_at: null,
      done_at: null,
      due_at: input.earliest_deadline_at,
      blocked_reason: null,
      demand_qty: input.demand_qty,
      production_qty: input.production_qty,
      done_qty: 0,
      shipment_count: input.shipment_count,
      shipment_ids: input.shipment_ids ?? [],
      earliest_deadline_at: input.earliest_deadline_at,
      priority_reason: input.priority_reason,
      priority: null,
      batch_id: null,
      batch_code: null,
    } satisfies ProductionLaunchItem);

  const next: ProductionLaunchItem = {
    ...existing,
    updated_at: now,
    due_at: input.earliest_deadline_at,
    demand_qty: input.demand_qty,
    production_qty: input.production_qty,
    done_qty:
      typeof input.done_qty === "number" && Number.isFinite(input.done_qty)
        ? Math.max(0, Math.min(input.production_qty, Math.floor(input.done_qty)))
        : existing.done_qty ?? 0,
    shipment_count: input.shipment_count,
    shipment_ids: input.shipment_ids ?? existing.shipment_ids ?? [],
    earliest_deadline_at: input.earliest_deadline_at,
    priority_reason: input.priority_reason,
    batch_id: input.batch_id ?? existing.batch_id ?? null,
    batch_code: input.batch_code ?? existing.batch_code ?? null,
  };

  if (input.update_action === "take") {
    if (existing.status !== "new") {
      const assigneeMatchesActor = existing.status === "in_progress" && existing.assignee_user_id === input.actor_user_id;
      if (!assigneeMatchesActor) {
        throw new Error("CONFLICT: production launch item already active");
      }
    }
    next.status = "in_progress";
    next.assignee_user_id = existing.assignee_user_id ?? input.actor_user_id;
    next.assignee_role_id = existing.assignee_role_id ?? input.actor_role_id;
    next.assignee_username = existing.assignee_username ?? input.actor_username;
    next.taken_at = existing.taken_at ?? now;
  } else if (input.update_action === "assign") {
    next.assignee_user_id = input.assignee_user_id ?? null;
    next.assignee_role_id = input.assignee_role_id ?? null;
    next.assignee_username = input.assignee_username ?? null;
  } else {
    next.status = input.status ?? existing.status ?? "new";
    next.blocked_reason = next.status === "blocked" ? input.blocked_reason ?? null : null;
    if (next.status === "done") {
      next.done_at = now;
      if (!next.batch_code) {
        next.batch_code = makeLocalBatchCode();
      }
      if (!next.batch_id) {
        next.batch_id = next.batch_code;
      }
    }
    if (next.status === "in_progress" && !next.taken_at) {
      next.taken_at = now;
    }
  }

  const nextItems = store.items.filter((item) => `${item.import_batch_id}:${item.sku_id}` !== key);
  nextItems.push(next);
  await writeStore({ items: nextItems });
  return next;
}

export function isProductionLaunchConflict(error: unknown): boolean {
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message?: unknown }).message || "").startsWith("CONFLICT:");
  }

  return typeof error === "string" && error.startsWith("CONFLICT:");
}

export function shouldUseLocalProductionFallback(): boolean {
  return isDevRuntime();
}

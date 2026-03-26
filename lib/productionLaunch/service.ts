import { parseErrorPayload } from "@/lib/api/gasError";
import { callGas } from "@/lib/integrations/gasClient";

export const PRODUCTION_LAUNCH_STATUSES = ["new", "in_progress", "blocked", "done"] as const;
export const PRODUCTION_LAUNCH_ACTIONS = ["take", "assign", "status"] as const;

export type ProductionLaunchStatus = (typeof PRODUCTION_LAUNCH_STATUSES)[number];
export type ProductionLaunchAction = (typeof PRODUCTION_LAUNCH_ACTIONS)[number];

type GasLaunchItem = {
  work_item_id?: unknown;
  import_batch_id?: unknown;
  sku_id?: unknown;
  status?: unknown;
  assignee_user_id?: unknown;
  assignee_role_id?: unknown;
  assignee_username?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  taken_at?: unknown;
  done_at?: unknown;
  due_at?: unknown;
  blocked_reason?: unknown;
  demand_qty?: unknown;
  production_qty?: unknown;
  done_qty?: unknown;
  shipment_count?: unknown;
  shipment_ids?: unknown;
  earliest_deadline_at?: unknown;
  priority_reason?: unknown;
  priority?: unknown;
  batch_id?: unknown;
  batch_code?: unknown;
};

type GasLaunchListResponse = {
  ok?: boolean;
  generated_at?: unknown;
  items?: unknown;
};

type GasLaunchUpdateResponse = {
  ok?: boolean;
  replayed?: unknown;
  item?: unknown;
};

export type ProductionLaunchItem = {
  work_item_id: string;
  import_batch_id: string;
  sku_id: string;
  status: ProductionLaunchStatus;
  assignee_user_id: string | null;
  assignee_role_id: string | null;
  assignee_username: string | null;
  created_at: string | null;
  updated_at: string | null;
  taken_at: string | null;
  done_at: string | null;
  due_at: string | null;
  blocked_reason: string | null;
  demand_qty: number;
  production_qty: number;
  done_qty: number;
  shipment_count: number;
  shipment_ids: string[];
  earliest_deadline_at: string | null;
  priority_reason: string | null;
  priority: number | null;
  batch_id: string | null;
  batch_code: string | null;
};

type ServiceError = {
  ok: false;
  error: string;
  code: string;
  details?: Record<string, unknown>;
};

type ListSuccess = {
  ok: true;
  generated_at: string;
  items: ProductionLaunchItem[];
};

type UpdateSuccess = {
  ok: true;
  replayed: boolean;
  item: ProductionLaunchItem;
};

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function strOrNull(value: unknown): string | null {
  const normalized = str(value);
  return normalized || null;
}

function num(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = num(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toIsoOrNull(value: unknown): string | null {
  const candidate = str(value);
  if (!candidate) {
    return null;
  }

  const parsed = Date.parse(candidate);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function normalizeStatus(value: unknown): ProductionLaunchStatus {
  const candidate = str(value).toLowerCase();
  if (PRODUCTION_LAUNCH_STATUSES.includes(candidate as ProductionLaunchStatus)) {
    return candidate as ProductionLaunchStatus;
  }

  return "new";
}

function normalizeItem(raw: unknown): ProductionLaunchItem | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }

  const item = raw as GasLaunchItem;
  const workItemId = str(item.work_item_id);
  const importBatchId = str(item.import_batch_id);
  const skuId = str(item.sku_id);

  if (!workItemId || !importBatchId || !skuId) {
    return null;
  }

  return {
    work_item_id: workItemId,
    import_batch_id: importBatchId,
    sku_id: skuId,
    status: normalizeStatus(item.status),
    assignee_user_id: strOrNull(item.assignee_user_id),
    assignee_role_id: strOrNull(item.assignee_role_id),
    assignee_username: strOrNull(item.assignee_username),
    created_at: toIsoOrNull(item.created_at),
    updated_at: toIsoOrNull(item.updated_at),
    taken_at: toIsoOrNull(item.taken_at),
    done_at: toIsoOrNull(item.done_at),
    due_at: toIsoOrNull(item.due_at),
    blocked_reason: strOrNull(item.blocked_reason),
    demand_qty: num(item.demand_qty),
    production_qty: num(item.production_qty),
    done_qty: num(item.done_qty),
    shipment_count: num(item.shipment_count),
    shipment_ids: Array.isArray(item.shipment_ids)
      ? item.shipment_ids
          .map((value) => str(value))
          .filter((value) => value.length > 0)
      : [],
    earliest_deadline_at: toIsoOrNull(item.earliest_deadline_at),
    priority_reason: strOrNull(item.priority_reason),
    priority: numOrNull(item.priority),
    batch_id: strOrNull(item.batch_id),
    batch_code: strOrNull(item.batch_code),
  };
}

function toServiceError(raw: unknown, fallback: string): ServiceError {
  const parsed = parseErrorPayload(raw);
  return {
    ok: false,
    error: parsed.error || fallback,
    code: parsed.code || "BAD_GATEWAY",
    ...(parsed.details ? { details: parsed.details } : {}),
  };
}

export async function listProductionLaunchItems(
  requestId: string,
  importBatchId?: string
): Promise<ListSuccess | ServiceError> {
  const response = await callGas<GasLaunchListResponse>(
    "production.launch.list",
    {
      ...(importBatchId ? { import_batch_id: importBatchId } : {}),
    },
    requestId,
    {
      timeoutMs: 25_000,
      retries: 1,
      retryBackoffMs: 500,
    }
  );

  if (!response.ok || !response.data) {
    return toServiceError(response.error, "Failed to read production launch items");
  }

  const rawItems = Array.isArray(response.data.items) ? response.data.items : [];
  const items = rawItems.map(normalizeItem).filter((item): item is ProductionLaunchItem => item !== null);
  const generatedAt = toIsoOrNull(response.data.generated_at) ?? new Date().toISOString();

  return {
    ok: true,
    generated_at: generatedAt,
    items,
  };
}

export async function updateProductionLaunch(input: {
  requestId: string;
  actor_user_id: string;
  actor_role_id: string;
  actor_username: string;
  import_batch_id: string;
  sku_id: string;
  production_qty: number;
  demand_qty: number;
  shipment_count: number;
  shipment_ids?: string[];
  done_qty?: number | null;
  earliest_deadline_at: string | null;
  priority_reason: string;
  priority?: number | null;
  update_action: ProductionLaunchAction;
  assignee_user_id?: string | null;
  assignee_role_id?: string | null;
  assignee_username?: string | null;
  status?: ProductionLaunchStatus;
  blocked_reason?: string | null;
  batch_id?: string | null;
  batch_code?: string | null;
}): Promise<UpdateSuccess | ServiceError> {
  const response = await callGas<GasLaunchUpdateResponse>(
    "production.launch.update",
    {
      actor_user_id: input.actor_user_id,
      actor_role_id: input.actor_role_id,
      actor_username: input.actor_username,
      import_batch_id: input.import_batch_id,
      sku_id: input.sku_id,
      production_qty: input.production_qty,
      ...(typeof input.done_qty === "number" ? { done_qty: input.done_qty } : {}),
      demand_qty: input.demand_qty,
      shipment_count: input.shipment_count,
      ...(Array.isArray(input.shipment_ids) && input.shipment_ids.length > 0 ? { shipment_ids: input.shipment_ids } : {}),
      earliest_deadline_at: input.earliest_deadline_at,
      priority_reason: input.priority_reason,
      ...(typeof input.priority === "number" ? { priority: input.priority } : {}),
      update_action: input.update_action,
      ...(input.assignee_user_id ? { assignee_user_id: input.assignee_user_id } : {}),
      ...(input.assignee_role_id ? { assignee_role_id: input.assignee_role_id } : {}),
      ...(input.assignee_username ? { assignee_username: input.assignee_username } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.blocked_reason ? { blocked_reason: input.blocked_reason } : {}),
      ...(input.batch_id ? { batch_id: input.batch_id } : {}),
      ...(input.batch_code ? { batch_code: input.batch_code } : {}),
    },
    input.requestId,
    {
      timeoutMs: 25_000,
      retries: 1,
      retryBackoffMs: 500,
    }
  );

  if (!response.ok || !response.data) {
    return toServiceError(response.error, "Failed to update production launch item");
  }

  const item = normalizeItem(response.data.item);
  if (!item) {
    return {
      ok: false,
      error: "Failed to update production launch item",
      code: "BAD_GATEWAY",
    };
  }

  return {
    ok: true,
    replayed: response.data.replayed === true,
    item,
  };
}

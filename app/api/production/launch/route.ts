import { NextResponse } from "next/server";

import { withDevFastTimeout } from "@/lib/dev/localReadFallbacks";
import { statusForErrorCode } from "@/lib/api/gasError";
import { callGas } from "@/lib/integrations/gasClient";
import {
  listLocalLaunchItems,
  shouldUseLocalProductionFallback,
  updateLocalLaunchItem,
} from "@/lib/dev/productionLaunchLocal";
import {
  PRODUCTION_LAUNCH_ACTIONS,
  PRODUCTION_LAUNCH_STATUSES,
  type ProductionLaunchAction,
  type ProductionLaunchStatus,
  listProductionLaunchItems,
  type ProductionLaunchItem,
  updateProductionLaunch,
} from "@/lib/productionLaunch/service";
import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { requireAnyRole } from "@/lib/server/guards";
import { getRolesForUser } from "@/lib/server/controlModel";
import { requireWritable } from "@/lib/flags/runtime";

type UpdateBody = {
  import_batch_id?: unknown;
  sku_id?: unknown;
  production_qty?: unknown;
  done_qty?: unknown;
  demand_qty?: unknown;
  shipment_count?: unknown;
  shipment_ids?: unknown;
  earliest_deadline_at?: unknown;
  priority_reason?: unknown;
  priority?: unknown;
  update_action?: unknown;
  assignee_user_id?: unknown;
  assignee_username?: unknown;
  status?: unknown;
  blocked_reason?: unknown;
};

type BatchCreateResult = {
  id?: unknown;
  code?: unknown;
  status?: unknown;
  created_at?: unknown;
};

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: {
      [REQUEST_ID_HEADER]: requestId,
    },
  });
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function num(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => str(item)).filter((item) => item.length > 0);
}

async function findExistingLaunchItem(requestId: string, importBatchId: string, skuId: string): Promise<ProductionLaunchItem | null> {
  const localItems = await listLocalLaunchItems(importBatchId);
  const localMatch = localItems.find((item) => item.sku_id === skuId);
  if (localMatch) {
    return localMatch;
  }

  const result = await withDevFastTimeout(listProductionLaunchItems(`${requestId}:current`, importBatchId), {
    ok: true as const,
    generated_at: new Date().toISOString(),
    items: localItems,
  });

  if (result.ok === false) {
    return null;
  }

  return result.items.find((item) => item.sku_id === skuId) ?? null;
}

async function createBatchForLaunch(params: {
  requestId: string;
  importBatchId: string;
  skuId: string;
  productionQty: number;
  shipmentIds: string[];
}): Promise<{ batch_id: string | null; batch_code: string | null }> {
  const response = await callGas<BatchCreateResult>(
    "batch_create",
    {
      note: `Production launch ${params.skuId}`,
      meta: {
        import_batch_id: params.importBatchId,
        sku_id: params.skuId,
        production_qty: params.productionQty,
        shipment_ids: params.shipmentIds,
        source: "production_launch_done",
      },
    },
    `${params.requestId}:batch`,
    {
      timeoutMs: 12_000,
      retries: 0,
    }
  );

  if (!response.ok || !response.data) {
    return { batch_id: null, batch_code: null };
  }

  const batchId = str(response.data.id) || null;
  const batchCode = str(response.data.code) || batchId;
  return { batch_id: batchId, batch_code: batchCode };
}

export async function GET(request: Request) {
  const auth = requireAnyRole(request, ["OWNER", "COO"]);
  if (auth.ok === false) {
    return auth.response;
  }

  const importBatchId = new URL(request.url).searchParams.get("import_batch_id")?.trim() ?? "";
  const localListFallback = {
    ok: true as const,
    generated_at: new Date().toISOString(),
    items: await listLocalLaunchItems(importBatchId || undefined),
  };
  const result = await withDevFastTimeout(listProductionLaunchItems(auth.requestId, importBatchId || undefined), localListFallback);

  if (result.ok === false) {
    if (shouldUseLocalProductionFallback()) {
      return json(auth.requestId, 200, {
        ok: true,
        generated_at: new Date().toISOString(),
        items: await listLocalLaunchItems(importBatchId || undefined),
      });
    }

    return json(auth.requestId, statusForErrorCode(result.code), {
      ok: false,
      error: result.error,
      code: result.code,
      ...(result.details ? { details: result.details } : {}),
    });
  }

  return json(auth.requestId, 200, {
    ok: true,
    generated_at: result.generated_at,
    items: result.items,
  });
}

export async function POST(request: Request) {
  const auth = requireAnyRole(request, ["OWNER", "COO"]);
  if (auth.ok === false) {
    return auth.response;
  }

  const readonly = await requireWritable(request, auth.requestId);
  if (readonly) {
    return readonly;
  }

  let body: UpdateBody;
  try {
    body = (await request.json()) as UpdateBody;
  } catch {
    return json(auth.requestId, 400, {
      ok: false,
      error: "Body must be a JSON object",
      code: "VALIDATION_ERROR",
    });
  }

  const importBatchId = str(body.import_batch_id);
  const skuId = str(body.sku_id);
  const productionQty = num(body.production_qty);
  const doneQty = num(body.done_qty);
  const demandQty = num(body.demand_qty);
  const shipmentCount = num(body.shipment_count);
  const shipmentIds = stringList(body.shipment_ids);
  const earliestDeadlineAt = str(body.earliest_deadline_at) || null;
  const priorityReason = str(body.priority_reason);
  const priority = num(body.priority);
  const updateAction = str(body.update_action).toLowerCase();
  const assigneeUserId = str(body.assignee_user_id);
  const assigneeUsername = str(body.assignee_username);
  const requestedStatus = str(body.status).toLowerCase();
  const blockedReason = str(body.blocked_reason) || null;

  if (!importBatchId || !skuId || productionQty === null || demandQty === null || shipmentCount === null || !priorityReason) {
    return json(auth.requestId, 400, {
      ok: false,
      error: "import_batch_id, sku_id, production_qty, demand_qty, shipment_count and priority_reason are required",
      code: "VALIDATION_ERROR",
    });
  }

  if (!PRODUCTION_LAUNCH_ACTIONS.includes(updateAction as ProductionLaunchAction)) {
    return json(auth.requestId, 400, {
      ok: false,
      error: "update_action must be one of: take, assign, status",
      code: "VALIDATION_ERROR",
    });
  }

  if (updateAction === "assign" && !assigneeUserId) {
    return json(auth.requestId, 400, {
      ok: false,
      error: "assignee_user_id is required for assign",
      code: "VALIDATION_ERROR",
    });
  }

  if (updateAction === "status" && !PRODUCTION_LAUNCH_STATUSES.includes(requestedStatus as ProductionLaunchStatus)) {
    return json(auth.requestId, 400, {
      ok: false,
      error: "status must be one of: new, in_progress, blocked, done",
      code: "VALIDATION_ERROR",
    });
  }

  if (requestedStatus === "blocked" && !blockedReason) {
    return json(auth.requestId, 400, {
      ok: false,
      error: "blocked_reason is required when status=blocked",
      code: "VALIDATION_ERROR",
    });
  }

  const actorRole = auth.user.roles[0]?.trim().toUpperCase() ?? "OWNER";
  const assigneeRoles =
    assigneeUserId && updateAction === "assign" ? await getRolesForUser(assigneeUserId).catch(() => []) : [];
  const assigneeRoleId = assigneeRoles[0]?.trim().toUpperCase() ?? null;
  const existingItem = await findExistingLaunchItem(auth.requestId, importBatchId, skuId);

  let batchMeta = {
    batch_id: existingItem?.batch_id ?? null,
    batch_code: existingItem?.batch_code ?? null,
  };

  if (updateAction === "status" && requestedStatus === "done" && !batchMeta.batch_code) {
    batchMeta = await createBatchForLaunch({
      requestId: auth.requestId,
      importBatchId,
      skuId,
      productionQty,
      shipmentIds,
    });
  }

  const localItemFallback = shouldUseLocalProductionFallback()
    ? await updateLocalLaunchItem({
        import_batch_id: importBatchId,
        sku_id: skuId,
        production_qty: productionQty,
        done_qty: doneQty,
        demand_qty: demandQty,
        shipment_count: shipmentCount,
        shipment_ids: shipmentIds,
        earliest_deadline_at: earliestDeadlineAt,
        priority_reason: priorityReason,
        actor_user_id: auth.user.user_id,
        actor_role_id: actorRole,
        actor_username: auth.user.username,
        update_action: updateAction as ProductionLaunchAction,
        assignee_user_id: assigneeUserId || null,
        assignee_role_id: assigneeRoleId,
        assignee_username: assigneeUsername || null,
        status: requestedStatus ? (requestedStatus as ProductionLaunchStatus) : undefined,
        blocked_reason: blockedReason,
        batch_id: batchMeta.batch_id,
        batch_code: batchMeta.batch_code,
      })
    : null;

  const result = await withDevFastTimeout(
    updateProductionLaunch({
      requestId: auth.requestId,
      actor_user_id: auth.user.user_id,
      actor_role_id: actorRole,
      actor_username: auth.user.username,
      import_batch_id: importBatchId,
      sku_id: skuId,
      production_qty: productionQty,
      done_qty: doneQty,
      demand_qty: demandQty,
      shipment_count: shipmentCount,
      shipment_ids: shipmentIds,
      earliest_deadline_at: earliestDeadlineAt,
      priority_reason: priorityReason,
      priority,
      update_action: updateAction as ProductionLaunchAction,
      assignee_user_id: assigneeUserId || null,
      assignee_role_id: assigneeRoleId,
      assignee_username: assigneeUsername || null,
      status: requestedStatus ? (requestedStatus as ProductionLaunchStatus) : undefined,
      blocked_reason: blockedReason,
      batch_id: batchMeta.batch_id,
      batch_code: batchMeta.batch_code,
    }),
    {
      ok: true as const,
      replayed: false,
      item: localItemFallback ?? {
        work_item_id: `prodlaunch_${importBatchId}_${skuId}`.replace(/[^A-Za-z0-9_-]+/g, "_"),
        import_batch_id: importBatchId,
        sku_id: skuId,
        status: requestedStatus ? (requestedStatus as ProductionLaunchStatus) : "new",
        assignee_user_id: assigneeUserId || null,
        assignee_role_id: assigneeRoleId,
        assignee_username: assigneeUsername || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        taken_at: null,
        done_at: null,
        due_at: earliestDeadlineAt,
        blocked_reason: blockedReason,
        demand_qty: demandQty,
        production_qty: productionQty,
        done_qty: doneQty ?? 0,
        shipment_count: shipmentCount,
        shipment_ids: shipmentIds,
        earliest_deadline_at: earliestDeadlineAt,
        priority_reason: priorityReason,
        priority,
        batch_id: batchMeta.batch_id,
        batch_code: batchMeta.batch_code,
      },
    }
  );

  if (result.ok === false) {
    if (shouldUseLocalProductionFallback()) {
      const item = await updateLocalLaunchItem({
        import_batch_id: importBatchId,
        sku_id: skuId,
        production_qty: productionQty,
        done_qty: doneQty,
        demand_qty: demandQty,
        shipment_count: shipmentCount,
        shipment_ids: shipmentIds,
        earliest_deadline_at: earliestDeadlineAt,
        priority_reason: priorityReason,
        actor_user_id: auth.user.user_id,
        actor_role_id: actorRole,
        actor_username: auth.user.username,
        update_action: updateAction as ProductionLaunchAction,
        assignee_user_id: assigneeUserId || null,
        assignee_role_id: assigneeRoleId,
        assignee_username: assigneeUsername || null,
        status: requestedStatus ? (requestedStatus as ProductionLaunchStatus) : undefined,
        blocked_reason: blockedReason,
        batch_id: batchMeta.batch_id,
        batch_code: batchMeta.batch_code,
      });

      return json(auth.requestId, 201, {
        ok: true,
        item,
        fallback: "local",
      });
    }

    return json(auth.requestId, statusForErrorCode(result.code), {
      ok: false,
      error: result.error,
      code: result.code,
      ...(result.details ? { details: result.details } : {}),
    });
  }

  return json(auth.requestId, result.replayed ? 200 : 201, {
    ok: true,
    ...(result.replayed ? { replayed: true } : {}),
    item: result.item,
  });
}

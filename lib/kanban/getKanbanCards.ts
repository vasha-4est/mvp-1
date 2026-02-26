import { parseErrorPayload, type ParsedGasError } from "@/lib/api/gasError";
import { callGas } from "@/lib/integrations/gasClient";

type KanbanColumn = {
  key: string;
  title: string;
  count: number;
};

type KanbanItem = {
  work_item_id: string;
  zone: string | null;
  station: string | null;
  task_type: string | null;
  status: string | null;
  priority: number | null;
  entity_type: string | null;
  entity_id: string | null;
  assignee_user_id: string | null;
  assignee_role_id: string | null;
  due_at: string | null;
  created_at: string | null;
  taken_at: string | null;
  done_at: string | null;
  blocked_reason: string | null;
  entity_label: string | null;
  sku_id: string | null;
  qty: number | null;
  payload_json: unknown | null;
};

export type KanbanPayload = {
  ok: true;
  generated_at: string;
  tz: "UTC";
  filters: {
    zone?: string;
    station?: string;
    status?: string;
    limit: number;
    cursor?: string | null;
  };
  columns: KanbanColumn[];
  items: KanbanItem[];
  cursor: string | null;
};

type GetKanbanResult = { ok: true; data: KanbanPayload } | ({ ok: false } & ParsedGasError);

type GasKanbanResponse = Partial<KanbanPayload>;

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function strOrNull(value: unknown): string | null {
  const v = str(value);
  return v || null;
}

function numOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function normalizeColumns(value: unknown): KanbanColumn[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      const row = toRecord(item);
      const key = str(row.key);
      const title = str(row.title);
      if (!key || !title) return null;

      return {
        key,
        title,
        count: numOrNull(row.count) ?? 0,
      };
    })
    .filter((item): item is KanbanColumn => item !== null);
}

function normalizeItems(value: unknown): KanbanItem[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      const row = toRecord(item);
      const workItemId = str(row.work_item_id);
      if (!workItemId) return null;

      return {
        work_item_id: workItemId,
        zone: strOrNull(row.zone),
        station: strOrNull(row.station),
        task_type: strOrNull(row.task_type),
        status: strOrNull(row.status),
        priority: numOrNull(row.priority),
        entity_type: strOrNull(row.entity_type),
        entity_id: strOrNull(row.entity_id),
        assignee_user_id: strOrNull(row.assignee_user_id),
        assignee_role_id: strOrNull(row.assignee_role_id),
        due_at: strOrNull(row.due_at),
        created_at: strOrNull(row.created_at),
        taken_at: strOrNull(row.taken_at),
        done_at: strOrNull(row.done_at),
        blocked_reason: strOrNull(row.blocked_reason),
        entity_label: strOrNull(row.entity_label),
        sku_id: strOrNull(row.sku_id),
        qty: numOrNull(row.qty),
        payload_json: row.payload_json ?? null,
      };
    })
    .filter((item): item is KanbanItem => item !== null);
}

function normalizePayload(payload: GasKanbanResponse): KanbanPayload {
  const filtersRaw = toRecord(payload.filters);
  const limit = numOrNull(filtersRaw.limit) ?? 200;
  const cursor = strOrNull(payload.cursor);

  return {
    ok: true,
    generated_at: str(payload.generated_at) || new Date(0).toISOString(),
    tz: "UTC",
    filters: {
      ...(str(filtersRaw.zone) ? { zone: str(filtersRaw.zone) } : {}),
      ...(str(filtersRaw.station) ? { station: str(filtersRaw.station) } : {}),
      ...(str(filtersRaw.status) ? { status: str(filtersRaw.status) } : {}),
      limit,
      cursor: strOrNull(filtersRaw.cursor),
    },
    columns: normalizeColumns(payload.columns),
    items: normalizeItems(payload.items),
    cursor,
  };
}

export async function getKanbanCards(
  requestId: string,
  payload: {
    zone?: string;
    station?: string;
    status?: string;
    limit: number;
    cursor?: string | null;
  }
): Promise<GetKanbanResult> {
  const response = await callGas<GasKanbanResponse>("kanban.get", payload, requestId, {
    timeoutMs: 20_000,
    retries: 1,
    retryBackoffMs: 300,
  });

  if (!response.ok) {
    return {
      ok: false,
      ...parseErrorPayload((response as { error?: unknown }).error),
    };
  }

  return {
    ok: true,
    data: normalizePayload(response.data ?? {}),
  };
}

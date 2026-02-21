import { parseErrorPayload, type ParsedGasError } from "@/lib/api/gasError";
import { callGas } from "@/lib/integrations/gasClient";

type GasBatchListItem = {
  code?: unknown;
  status?: unknown;
  created_at?: unknown;
  title?: unknown;
  product?: unknown;
  quantity?: unknown;
  qty?: unknown;
};

type GasBatchListResponse = {
  items?: GasBatchListItem[];
};

export type PackagingQueueItem = {
  batch_code: string;
  product: string;
  quantity: number;
  created_at: string;
};

type GetPackagingQueueOk = {
  ok: true;
  items: PackagingQueueItem[];
};

type GetPackagingQueueError = {
  ok: false;
} & ParsedGasError;

export type GetPackagingQueueResult = GetPackagingQueueOk | GetPackagingQueueError;

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeQuantity(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function createdAtSortValue(createdAt: string): number {
  const parsed = Date.parse(createdAt);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

export async function getPackagingQueue(requestId: string): Promise<GetPackagingQueueResult> {
  const gasResponse = await callGas<GasBatchListResponse>("batch_list", { status: "ready" }, requestId);

  if (!gasResponse.ok || !gasResponse.data || !Array.isArray(gasResponse.data.items)) {
    return { ok: false, ...parseErrorPayload((gasResponse as { error?: unknown }).error) };
  }

  const items: PackagingQueueItem[] = [];

  for (const item of gasResponse.data.items) {
    const batchCode = normalizeString(item.code);
    if (!batchCode) {
      continue;
    }

    const status = normalizeString(item.status)?.toLowerCase();
    const readyForPackaging = status === "ready";
    if (!readyForPackaging) {
      continue;
    }

    const createdAt = normalizeString(item.created_at);
    if (!createdAt) {
      continue;
    }

    const createdAtDate = new Date(createdAt);
    if (Number.isNaN(createdAtDate.getTime())) {
      continue;
    }

    items.push({
      batch_code: batchCode,
      product: normalizeString(item.product) ?? normalizeString(item.title) ?? "—",
      quantity: normalizeQuantity(item.quantity ?? item.qty),
      created_at: createdAtDate.toISOString(),
    });
  }

  items.sort((left, right) => createdAtSortValue(left.created_at) - createdAtSortValue(right.created_at));

  return {
    ok: true,
    items,
  };
}

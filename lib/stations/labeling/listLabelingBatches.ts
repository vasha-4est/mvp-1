import { parseErrorPayload, type ParsedGasError } from "@/lib/api/gasError";
import { callGas } from "@/lib/integrations/gasClient";

type GasBatchListItem = {
  code?: unknown;
  product?: unknown;
  title?: unknown;
  quantity?: unknown;
  qty?: unknown;
  packaging_completed_at?: unknown;
  created_at?: unknown;
};

type GasBatchListResponse = {
  items?: GasBatchListItem[];
  total?: number;
};

export type LabelingBatchItem = {
  code: string;
  product: string;
  quantity: number;
  packaging_completed_at: string | null;
  created_at: string;
};

type ListLabelingBatchesOk = {
  ok: true;
  data: LabelingBatchItem[];
};

type ListLabelingBatchesError = {
  ok: false;
} & ParsedGasError;

export type ListLabelingBatchesResult = ListLabelingBatchesOk | ListLabelingBatchesError;

function normalizeString(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function normalizeNullableString(value: unknown): string | null {
  const normalized = normalizeString(value);
  return normalized ? normalized : null;
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

function toSortTimestamp(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sortByPackagingThenCreated(left: LabelingBatchItem, right: LabelingBatchItem): number {
  const leftPackaging = toSortTimestamp(left.packaging_completed_at);
  const rightPackaging = toSortTimestamp(right.packaging_completed_at);

  if (leftPackaging !== null && rightPackaging !== null && leftPackaging !== rightPackaging) {
    return leftPackaging - rightPackaging;
  }

  const leftCreated = toSortTimestamp(left.created_at);
  const rightCreated = toSortTimestamp(right.created_at);

  if (leftCreated !== null && rightCreated !== null && leftCreated !== rightCreated) {
    return leftCreated - rightCreated;
  }

  if (leftPackaging !== null && rightPackaging === null) {
    return -1;
  }

  if (leftPackaging === null && rightPackaging !== null) {
    return 1;
  }

  if (leftCreated !== null && rightCreated === null) {
    return -1;
  }

  if (leftCreated === null && rightCreated !== null) {
    return 1;
  }

  return left.code.localeCompare(right.code);
}

export async function listLabelingBatches(requestId: string): Promise<ListLabelingBatchesResult> {
  const gasResponse = await callGas<GasBatchListResponse>("batch_list", { status: "packaged" }, requestId);

  if (!gasResponse.ok || !gasResponse.data || !Array.isArray(gasResponse.data.items)) {
    const parsed = parseErrorPayload((gasResponse as { error?: unknown }).error);
    return { ok: false, ...parsed };
  }

  const batches: LabelingBatchItem[] = [];

  for (const item of gasResponse.data.items) {
    const code = normalizeString(item.code);
    if (!code) {
      continue;
    }

    batches.push({
      code,
      product: normalizeString(item.product) || normalizeString(item.title),
      quantity: normalizeQuantity(item.quantity ?? item.qty),
      packaging_completed_at: normalizeNullableString(item.packaging_completed_at),
      created_at: normalizeString(item.created_at),
    });
  }

  batches.sort(sortByPackagingThenCreated);

  return {
    ok: true,
    data: batches,
  };
}

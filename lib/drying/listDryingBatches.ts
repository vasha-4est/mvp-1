import { callGas } from "@/lib/integrations/gasClient";
import { parseErrorPayload, type ParsedGasError } from "@/lib/api/gasError";

type GasBatchListItem = {
  code?: unknown;
  dry_start_at?: unknown;
  dry_end_at?: unknown;
  created_at?: unknown;
  title?: unknown;
};

type GasBatchListResponse = {
  items?: GasBatchListItem[];
  total?: number;
};

export type DryingBatchItem = {
  code: string;
  status: "drying";
  dry_start_at: string | null;
  dry_end_at: string | null;
  created_at: string | null;
  title: string | null;
};

type ListDryingBatchesOk = {
  ok: true;
  data: DryingBatchItem[];
};

type ListDryingBatchesError = {
  ok: false;
} & ParsedGasError;

export type ListDryingBatchesResult = ListDryingBatchesOk | ListDryingBatchesError;

function normalizeStringOrNull(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeCode(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function dryEndSortMs(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function listDryingBatches(requestId: string): Promise<ListDryingBatchesResult> {
  const gasResponse = await callGas<GasBatchListResponse>("batch_list", { status: "drying" }, requestId);

  if (!gasResponse.ok || !gasResponse.data || !Array.isArray(gasResponse.data.items)) {
    const parsed = parseErrorPayload((gasResponse as { error?: unknown }).error);
    return { ok: false, ...parsed };
  }

  const batches: DryingBatchItem[] = [];

  for (const item of gasResponse.data.items) {
    const code = normalizeCode(item.code);
    if (!code) {
      continue;
    }

    batches.push({
      code,
      status: "drying",
      dry_start_at: normalizeStringOrNull(item.dry_start_at),
      dry_end_at: normalizeStringOrNull(item.dry_end_at),
      created_at: normalizeStringOrNull(item.created_at),
      title: normalizeStringOrNull(item.title),
    });
  }

  batches.sort((left, right) => {
    const leftMs = dryEndSortMs(left.dry_end_at);
    const rightMs = dryEndSortMs(right.dry_end_at);

    if (leftMs === null && rightMs === null) {
      return left.code.localeCompare(right.code);
    }

    if (leftMs === null) {
      return 1;
    }

    if (rightMs === null) {
      return -1;
    }

    return leftMs - rightMs;
  });

  return {
    ok: true,
    data: batches,
  };
}

export type AssemblyBatch = {
  code: string;
  product: string;
  quantity: number;
  qc_completed_at: string | null;
};

type RawBatchRecord = Record<string, unknown>;

function asRecord(value: unknown): RawBatchRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as RawBatchRecord;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function asNumber(value: unknown): number {
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

function toIsoDate(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) {
    return null;
  }

  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return new Date(parsed).toISOString();
}

function resolveQcCompletedAt(record: RawBatchRecord): string | null {
  const candidates = [
    record.qc_completed_at,
    record.qcCompletedAt,
    record.qc_complete_at,
    record.quality_completed_at,
    record.qc_done_at,
  ];

  for (const candidate of candidates) {
    const iso = toIsoDate(candidate);
    if (iso) {
      return iso;
    }
  }

  return null;
}

function isAfterQcByFlag(record: RawBatchRecord): boolean {
  const candidates = [record.after_qc, record.is_after_qc, record.qc_passed, record.in_assembly_queue];
  return candidates.some((value) => value === true);
}

function compareAssemblyBatches(left: AssemblyBatch, right: AssemblyBatch): number {
  if (left.qc_completed_at && right.qc_completed_at) {
    const dateDelta = Date.parse(left.qc_completed_at) - Date.parse(right.qc_completed_at);
    if (dateDelta !== 0) {
      return dateDelta;
    }
  } else if (left.qc_completed_at && !right.qc_completed_at) {
    return -1;
  } else if (!left.qc_completed_at && right.qc_completed_at) {
    return 1;
  }

  return left.code.localeCompare(right.code);
}

export function normalizeAssemblyBatches(items: unknown[]): AssemblyBatch[] {
  const normalized: AssemblyBatch[] = [];

  for (const item of items) {
    const record = asRecord(item);
    if (!record) {
      continue;
    }

    const code =
      asString(record.code) ??
      asString(record.batch_code) ??
      asString(record.batchCode) ??
      asString(record.id);

    if (!code) {
      continue;
    }

    const qcCompletedAt = resolveQcCompletedAt(record);
    const isAfterQc = Boolean(qcCompletedAt) || isAfterQcByFlag(record);
    if (!isAfterQc) {
      continue;
    }

    const product =
      asString(record.product) ??
      asString(record.product_name) ??
      asString(record.productName) ??
      asString(record.sku) ??
      "—";

    const quantity = asNumber(record.quantity ?? record.qty ?? record.amount);

    normalized.push({
      code,
      product,
      quantity,
      qc_completed_at: qcCompletedAt,
    });
  }

  return normalized.sort(compareAssemblyBatches);
}

export function filterAssemblyBatchesByCode(items: AssemblyBatch[], query: string): AssemblyBatch[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return items;
  }

  return items.filter((item) => item.code.toLowerCase().includes(normalizedQuery));
}

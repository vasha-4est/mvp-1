import { callGas } from "@/lib/integrations/gasClient";

export type QcBatch = {
  code: string;
  product: string;
  quantity: number;
  labeled_at: string;
};

type GasBatchListItem = {
  code?: unknown;
  status?: unknown;
  product?: unknown;
  title?: unknown;
  quantity?: unknown;
  qty?: unknown;
  labeled_at?: unknown;
};

type GasBatchListResponse = {
  items?: unknown;
};

type GasBatchEvent = {
  at?: unknown;
  type?: unknown;
  details?: unknown;
};

type GasBatchEventsResponse = {
  events?: unknown;
};

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function asPositiveNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  return 0;
}

function asIsoString(value: unknown): string | null {
  const raw = asTrimmedString(value);
  if (!raw) {
    return null;
  }

  const parsedMs = Date.parse(raw);
  if (!Number.isFinite(parsedMs)) {
    return null;
  }

  return new Date(parsedMs).toISOString();
}

function getLabeledAtFromEvents(events: GasBatchEvent[]): string | null {
  let newestLabeledAtMs = Number.NEGATIVE_INFINITY;

  for (const event of events) {
    if (asTrimmedString(event.type) !== "batch_status_changed") {
      continue;
    }

    const details =
      typeof event.details === "object" && event.details !== null
        ? (event.details as Record<string, unknown>)
        : null;

    const toStatus = asTrimmedString(details?.to_status);
    if (toStatus !== "labeled") {
      continue;
    }

    const atRaw = asTrimmedString(event.at);
    if (!atRaw) {
      continue;
    }

    const atMs = Date.parse(atRaw);
    if (!Number.isFinite(atMs)) {
      continue;
    }

    if (atMs > newestLabeledAtMs) {
      newestLabeledAtMs = atMs;
    }
  }

  if (!Number.isFinite(newestLabeledAtMs)) {
    return null;
  }

  return new Date(newestLabeledAtMs).toISOString();
}

async function fetchFallbackLabeledAt(code: string, requestId: string): Promise<string | null> {
  const eventsResponse = await callGas<GasBatchEventsResponse>("batch_events_list", { code }, requestId);

  if (!eventsResponse.ok || !eventsResponse.data) {
    return null;
  }

  const events = Array.isArray(eventsResponse.data.events) ? (eventsResponse.data.events as GasBatchEvent[]) : [];
  return getLabeledAtFromEvents(events);
}

export async function listQcBatches(requestId: string): Promise<QcBatch[]> {
  const response = await callGas<GasBatchListResponse>("batch_list", {}, requestId);

  if (!response.ok || !response.data) {
    throw new Error("Failed to fetch batch list");
  }

  const items = Array.isArray(response.data.items) ? (response.data.items as GasBatchListItem[]) : [];
  const labeledItems = items.filter((item) => asTrimmedString(item.status) === "labeled");

  const resolved = await Promise.all(
    labeledItems.map(async (item) => {
      const code = asTrimmedString(item.code);
      if (!code) {
        return null;
      }

      const directLabeledAt = asIsoString(item.labeled_at);
      const derivedLabeledAt = directLabeledAt ?? (await fetchFallbackLabeledAt(code, requestId));

      if (!derivedLabeledAt) {
        return null;
      }

      return {
        code,
        product: asTrimmedString(item.product) ?? asTrimmedString(item.title) ?? "—",
        quantity: asPositiveNumber(item.quantity ?? item.qty),
        labeled_at: derivedLabeledAt,
      } satisfies QcBatch;
    })
  );

  return resolved
    .filter((item): item is QcBatch => item !== null)
    .sort((left, right) => Date.parse(left.labeled_at) - Date.parse(right.labeled_at));
}

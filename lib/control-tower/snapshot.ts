import { callGas } from "@/lib/integrations/gasClient";

const OPEN_STATUSES = new Set(["created", "production", "drying", "ready"]);
const DRYING_STATUS = "drying";
const DUE_4H_WINDOW_MS = 4 * 60 * 60 * 1000;
const RECENT_EVENTS_LIMIT = 20;

type BatchListItem = {
  code?: unknown;
  status?: unknown;
  dry_end_at?: unknown;
};

type BatchListResponse = {
  items?: BatchListItem[];
};

type BatchEvent = {
  at?: unknown;
  batch_code?: unknown;
  type?: unknown;
  details?: unknown;
};

type BatchEventsResponse = {
  events?: BatchEvent[];
};

export type ControlTowerSnapshot = {
  wip: { total_open_batches: number };
  drying: { overdue: number; due_4h: number; due_later: number; no_date: number };
  stations: { packaging_queue: number; labeling_queue: number; qc_queue: number; assembly_queue: number };
  recent_events: Array<{ ts: string; type: string; batch_code: string | null; message: string | null }>;
};

export type ControlTowerSnapshotContext = {
  requestId: string;
  now?: Date;
};

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function parseIso(value: unknown): string | null {
  const raw = asTrimmedString(value);
  if (!raw) {
    return null;
  }

  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return new Date(parsed).toISOString();
}

function buildMessage(details: unknown): string | null {
  if (typeof details === "string") {
    const normalized = details.trim();
    return normalized.length > 0 ? normalized : null;
  }

  if (typeof details !== "object" || details === null) {
    return null;
  }

  try {
    return JSON.stringify(details);
  } catch {
    return null;
  }
}

export async function getControlTowerSnapshot(
  context: ControlTowerSnapshotContext
): Promise<ControlTowerSnapshot> {
  const nowMs = (context.now ?? new Date()).getTime();
  const dueWindowMs = nowMs + DUE_4H_WINDOW_MS;

  const batchesResponse = await callGas<BatchListResponse>("batch_list", {}, context.requestId);

  if (!batchesResponse.ok || !batchesResponse.data) {
    throw new Error("Failed to fetch batches");
  }

  const batches = Array.isArray(batchesResponse.data.items) ? batchesResponse.data.items : [];

  let totalOpenBatches = 0;
  let overdue = 0;
  let due4h = 0;
  let dueLater = 0;
  let noDate = 0;
  const batchCodes: string[] = [];

  for (const batch of batches) {
    const status = asTrimmedString(batch.status) ?? "created";
    const code = asTrimmedString(batch.code);

    if (OPEN_STATUSES.has(status)) {
      totalOpenBatches += 1;
    }

    if (code) {
      batchCodes.push(code);
    }

    if (status !== DRYING_STATUS) {
      continue;
    }

    const dryEndAt = parseIso(batch.dry_end_at);

    if (!dryEndAt) {
      noDate += 1;
      continue;
    }

    const dryEndAtMs = Date.parse(dryEndAt);

    if (dryEndAtMs < nowMs) {
      overdue += 1;
    } else if (dryEndAtMs < dueWindowMs) {
      due4h += 1;
    } else {
      dueLater += 1;
    }
  }

  const eventResults = await Promise.allSettled(
    batchCodes.map((code) => callGas<BatchEventsResponse>("batch_events_list", { code }, context.requestId))
  );

  const recentEvents: ControlTowerSnapshot["recent_events"] = [];

  for (const result of eventResults) {
    if (result.status !== "fulfilled" || !result.value.ok || !result.value.data) {
      continue;
    }

    const events = Array.isArray(result.value.data.events) ? result.value.data.events : [];

    for (const raw of events) {
      const ts = parseIso(raw.at);
      const type = asTrimmedString(raw.type);

      if (!ts || !type) {
        continue;
      }

      recentEvents.push({
        ts,
        type,
        batch_code: asTrimmedString(raw.batch_code),
        message: buildMessage(raw.details),
      });
    }
  }

  recentEvents.sort((left, right) => Date.parse(right.ts) - Date.parse(left.ts));

  return {
    wip: { total_open_batches: totalOpenBatches },
    drying: { overdue, due_4h: due4h, due_later: dueLater, no_date: noDate },
    stations: {
      packaging_queue: 0,
      labeling_queue: 0,
      qc_queue: 0,
      assembly_queue: 0,
    },
    recent_events: recentEvents.slice(0, RECENT_EVENTS_LIMIT),
  };
}

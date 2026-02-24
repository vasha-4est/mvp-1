import { callGas } from "@/lib/integrations/gasClient";

const OPEN_STATUSES = new Set(["created", "production", "drying", "ready", "packaged", "labeled"]);

type GasBatchListItem = {
  status?: unknown;
};

type GasBatchListResponse = {
  items?: unknown;
};

export type WipWarning = {
  code: string;
  message: string;
};

export type WipSummary = {
  ok: true;
  wip: {
    total_open: number;
    by_status: Record<string, number>;
  };
  stations: {
    packaging_queue: number;
    labeling_queue: number;
    qc_queue: number;
    assembly_queue: number;
  };
  warnings: WipWarning[];
};

function asStatus(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function incrementCount(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

function buildWarnings(totalOpen: number, stationQueues: WipSummary["stations"]): WipWarning[] {
  const warnings: WipWarning[] = [];

  if (totalOpen > 50) {
    warnings.push({
      code: "WIP_HIGH",
      message: `Total open WIP is high (${totalOpen}).`,
    });
  }

  const maxStationQueue = Math.max(
    stationQueues.packaging_queue,
    stationQueues.labeling_queue,
    stationQueues.qc_queue,
    stationQueues.assembly_queue
  );

  if (maxStationQueue > 20) {
    warnings.push({
      code: "STATION_QUEUE_HIGH",
      message: `At least one station queue is high (${maxStationQueue}).`,
    });
  }

  return warnings;
}

export async function getWipSummary(requestId: string): Promise<WipSummary> {
  const response = await callGas<GasBatchListResponse>("batch_list", {}, requestId);

  if (!response.ok || !response.data) {
    throw new Error("Failed to fetch batch list");
  }

  const items = Array.isArray(response.data.items) ? (response.data.items as GasBatchListItem[]) : [];
  const byStatus: Record<string, number> = {};

  let totalOpen = 0;
  let packagingQueue = 0;
  let labelingQueue = 0;
  let qcQueue = 0;
  let assemblyQueue = 0;

  for (const item of items) {
    const status = asStatus(item.status);
    if (!status) {
      continue;
    }

    incrementCount(byStatus, status);

    if (OPEN_STATUSES.has(status)) {
      totalOpen += 1;
    }

    if (status === "ready") {
      packagingQueue += 1;
      continue;
    }

    if (status === "packaged") {
      labelingQueue += 1;
      continue;
    }

    if (status === "labeled") {
      qcQueue += 1;
      continue;
    }

    if (status === "created" || status === "production") {
      assemblyQueue += 1;
    }
  }

  const stations = {
    packaging_queue: packagingQueue,
    labeling_queue: labelingQueue,
    qc_queue: qcQueue,
    assembly_queue: assemblyQueue,
  };

  return {
    ok: true,
    wip: {
      total_open: totalOpen,
      by_status: byStatus,
    },
    stations,
    warnings: buildWarnings(totalOpen, stations),
  };
}

import { NextResponse } from "next/server";

import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { requireRole } from "@/lib/server/guards";

type AssemblyAvailabilityRow = {
  availability?: unknown;
  bottleneck_component?: unknown;
};

type AssemblyResponse = {
  data?: unknown;
};

type Bottleneck = {
  component_sku: string;
  count: number;
};

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: {
      [REQUEST_ID_HEADER]: requestId,
    },
  });
}


function emptyAssembly() {
  return {
    zero_available_sets: 0,
    availability_stats: { min: 0, median: 0, max: 0 },
    top_bottlenecks: [] as Bottleneck[],
  };
}

function getAvailability(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const numeric = Number(String(value ?? ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
}

function asAssemblyRows(payload: AssemblyResponse): AssemblyAvailabilityRow[] {
  if (!Array.isArray(payload.data)) {
    return [];
  }

  return payload.data
    .map((item): AssemblyAvailabilityRow | null => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      return item as AssemblyAvailabilityRow;
    })
    .filter((item): item is AssemblyAvailabilityRow => item !== null);
}

function topBottlenecks(rows: AssemblyAvailabilityRow[]): Bottleneck[] {
  const counts = new Map<string, number>();

  for (const row of rows) {
    if (typeof row.bottleneck_component !== "string") {
      continue;
    }

    const component = row.bottleneck_component.trim();
    if (!component) {
      continue;
    }

    counts.set(component, (counts.get(component) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([component_sku, count]) => ({ component_sku, count }))
    .sort((left, right) => right.count - left.count || left.component_sku.localeCompare(right.component_sku));
}

export async function GET(request: Request) {
  const auth = requireRole(request, ["OWNER", "COO"]);

  if (auth.ok === false) {
    return auth.response;
  }

  const assemblyUrl = new URL("/api/stations/assembly", request.url);

  let assemblyResponse: Response;
  try {
    assemblyResponse = await fetch(assemblyUrl, {
      method: "GET",
      cache: "no-store",
      headers: {
        [REQUEST_ID_HEADER]: auth.requestId,
        cookie: request.headers.get("cookie") ?? "",
      },
    });
  } catch {
    return json(auth.requestId, 200, {
      ok: true,
      assembly: emptyAssembly(),
      warning: { code: "ASSEMBLY_FETCH_FAILED" },
    });
  }

  if (!assemblyResponse.ok) {
    return json(auth.requestId, 200, {
      ok: true,
      assembly: emptyAssembly(),
      warning: { code: "ASSEMBLY_FETCH_FAILED" },
    });
  }

  let payload: AssemblyResponse;
  try {
    payload = (await assemblyResponse.json()) as AssemblyResponse;
  } catch {
    return json(auth.requestId, 200, {
      ok: true,
      assembly: emptyAssembly(),
      warning: { code: "ASSEMBLY_FETCH_FAILED" },
    });
  }

  const rows = asAssemblyRows(payload);
  const availabilities = rows.map((row) => getAvailability(row.availability));

  const min = availabilities.length > 0 ? Math.min(...availabilities) : 0;
  const max = availabilities.length > 0 ? Math.max(...availabilities) : 0;
  const zeroAvailableSets = availabilities.filter((availability) => availability === 0).length;

  return json(auth.requestId, 200, {
    ok: true,
    assembly: {
      zero_available_sets: zeroAvailableSets,
      availability_stats: {
        min,
        median: median(availabilities),
        max,
      },
      top_bottlenecks: topBottlenecks(rows),
    },
  });
}

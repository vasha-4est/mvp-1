"use client";

import { useEffect, useMemo, useState } from "react";

import { AssemblyTable, type AssemblyBomStateMap } from "@/components/stations/assembly/AssemblyTable";
import {
  filterAssemblySetSkus,
  normalizeAssemblyBomComponents,
  type AssemblySetSku,
} from "@/lib/stations/assembly/normalize";

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; rows: AssemblySetSku[] };

type BomPayload = {
  data?: unknown;
};

type BomFetchResult = {
  sku: string;
  state: AssemblyBomStateMap[string];
};

function emptyBomState(rows: AssemblySetSku[]): AssemblyBomStateMap {
  return Object.fromEntries(rows.map((row) => [row.sku, { status: "loading", components: [] }])) as AssemblyBomStateMap;
}

export function AssemblyStationClient() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [bomBySku, setBomBySku] = useState<AssemblyBomStateMap>({});
  const [query, setQuery] = useState("");

  useEffect(() => {
    let isMounted = true;

    const loadSets = async () => {
      setState({ status: "loading" });

      try {
        const response = await fetch("/api/stations/assembly", {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok) {
          if (isMounted) {
            setState({ status: "error" });
          }
          return;
        }

        const payload = (await response.json()) as { data?: unknown };
        const rows = Array.isArray(payload.data) ? (payload.data as AssemblySetSku[]) : [];

        if (isMounted) {
          setState({ status: "ready", rows });
          setBomBySku(emptyBomState(rows));
        }
      } catch {
        if (isMounted) {
          setState({ status: "error" });
        }
      }
    };

    void loadSets();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (state.status !== "ready") {
      return;
    }

    let isMounted = true;

    const resolveBoms = async () => {
      const results: BomFetchResult[] = await Promise.all(
        state.rows.map(async (row): Promise<BomFetchResult> => {
          try {
            const response = await fetch(`/api/bom/${encodeURIComponent(row.sku)}`, {
              method: "GET",
              cache: "no-store",
            });

            if (response.status === 404) {
              return {
                sku: row.sku,
                state: { status: "not_found", components: [] as ReturnType<typeof normalizeAssemblyBomComponents> },
              };
            }

            if (!response.ok) {
              return {
                sku: row.sku,
                state: { status: "error", components: [] as ReturnType<typeof normalizeAssemblyBomComponents> },
              };
            }

            const payload = (await response.json()) as BomPayload;
            const rawItems = Array.isArray(payload.data)
              ? payload.data
              : payload.data && typeof payload.data === "object" && Array.isArray((payload.data as { items?: unknown }).items)
              ? ((payload.data as { items: unknown[] }).items ?? [])
              : payload.data && typeof payload.data === "object" && Array.isArray((payload.data as { components?: unknown }).components)
              ? ((payload.data as { components: unknown[] }).components ?? [])
              : [];

            return {
              sku: row.sku,
              state: { status: "ready", components: normalizeAssemblyBomComponents(rawItems) },
            };
          } catch {
            return {
              sku: row.sku,
              state: { status: "error", components: [] as ReturnType<typeof normalizeAssemblyBomComponents> },
            };
          }
        })
      );

      if (!isMounted) {
        return;
      }

      setBomBySku((prev) => {
        const next = { ...prev };
        for (const result of results) {
          next[result.sku] = result.state;
        }
        return next;
      });
    };

    void resolveBoms();

    return () => {
      isMounted = false;
    };
  }, [state]);

  const filteredRows = useMemo(() => {
    if (state.status !== "ready") {
      return [];
    }

    return filterAssemblySetSkus(state.rows, query);
  }, [state, query]);

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <label htmlFor="assembly-search" style={{ display: "grid", gap: 6, maxWidth: 320 }}>
        <span>Search set SKU</span>
        <input
          id="assembly-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Enter set SKU"
          style={{ padding: "8px 10px", border: "1px solid #ccc", borderRadius: 6 }}
        />
      </label>

      {state.status === "loading" ? <p style={{ margin: 0 }}>Loading...</p> : null}
      {state.status === "error" ? <p style={{ margin: 0 }}>Could not load assembly data. Please try again.</p> : null}
      {state.status === "ready" ? <AssemblyTable rows={filteredRows} bomBySku={bomBySku} /> : null}
    </section>
  );
}

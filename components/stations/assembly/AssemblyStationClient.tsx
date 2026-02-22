"use client";

import { useEffect, useMemo, useState } from "react";

import { AssemblyTable } from "@/components/stations/assembly/AssemblyTable";
import { filterAssemblyBatchesByCode, type AssemblyBatch } from "@/lib/stations/assembly/normalize";

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; rows: AssemblyBatch[] };

export function AssemblyStationClient() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [query, setQuery] = useState("");

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
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
        const rows = Array.isArray(payload.data) ? (payload.data as AssemblyBatch[]) : [];

        if (isMounted) {
          setState({ status: "ready", rows });
        }
      } catch {
        if (isMounted) {
          setState({ status: "error" });
        }
      }
    };

    void load();

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredRows = useMemo(() => {
    if (state.status !== "ready") {
      return [];
    }

    return filterAssemblyBatchesByCode(state.rows, query);
  }, [state, query]);

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <label htmlFor="assembly-search" style={{ display: "grid", gap: 6, maxWidth: 320 }}>
        <span>Search by batch code</span>
        <input
          id="assembly-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Enter code"
          style={{ padding: "8px 10px", border: "1px solid #ccc", borderRadius: 6 }}
        />
      </label>

      {state.status === "loading" ? <p style={{ margin: 0 }}>Loading...</p> : null}
      {state.status === "error" ? <p style={{ margin: 0 }}>Could not load assembly data. Please try again.</p> : null}
      {state.status === "ready" ? <AssemblyTable rows={filteredRows} /> : null}
    </section>
  );
}

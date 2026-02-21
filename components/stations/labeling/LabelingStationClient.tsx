"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type LabelingItem = {
  code: string;
  product: string;
  quantity: number;
  packaging_completed_at: string | null;
  created_at: string;
};

type LabelingResponse = {
  ok?: boolean;
  data?: LabelingItem[];
};

function formatLocalDate(value: string | null): string {
  if (!value) {
    return "—";
  }

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return "—";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(parsed));
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export default function LabelingStationClient() {
  const [items, setItems] = useState<LabelingItem[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const controllerRef = useRef<AbortController | null>(null);

  const loadData = useCallback(async () => {
    controllerRef.current?.abort();
    const nextController = new AbortController();
    controllerRef.current = nextController;

    setIsLoading(true);

    try {
      const response = await fetch("/api/stations/labeling", {
        method: "GET",
        cache: "no-store",
        credentials: "include",
        signal: nextController.signal,
      });

      const payload = (await response.json().catch(() => null)) as LabelingResponse | null;

      if (!response.ok) {
        setError(`Could not load labeling batches (HTTP ${response.status}).`);
        setItems([]);
        return;
      }

      setItems(Array.isArray(payload?.data) ? payload.data : []);
      setError(null);
    } catch (fetchError) {
      if (isAbortError(fetchError)) {
        return;
      }

      setError("Could not load labeling batches. Please try again.");
      setItems([]);
    } finally {
      if (controllerRef.current === nextController) {
        controllerRef.current = null;
      }

      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();

    return () => {
      controllerRef.current?.abort();
    };
  }, [loadData]);

  const filteredItems = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) {
      return items;
    }

    return items.filter((item) => item.code.toLowerCase().includes(normalizedSearch));
  }, [items, search]);

  return (
    <section style={{ padding: "16px 0" }}>
      <h1 style={{ marginBottom: 6 }}>Labeling Station</h1>
      <p style={{ marginTop: 0, color: "#4b5563" }}>Read-only list of batches ready for labeling.</p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <span>Search code</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="e.g. BT-2026"
            style={{ padding: "6px 8px" }}
          />
        </label>
      </div>

      {isLoading ? <p style={{ color: "#6b7280" }}>Loading…</p> : null}

      {error ? (
        <p role="alert" style={{ color: "#991b1b", background: "#fef2f2", padding: "8px 10px" }}>
          {error}
        </p>
      ) : null}

      {!error && !isLoading && filteredItems.length === 0 ? <p>No batches ready for labeling.</p> : null}

      {!error && filteredItems.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th align="left">Batch code</th>
                <th align="left">Product</th>
                <th align="left">Quantity</th>
                <th align="left">Packaging completed at</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr key={item.code}>
                  <td style={{ padding: "8px 0" }}>{item.code}</td>
                  <td>{item.product || "—"}</td>
                  <td>{item.quantity}</td>
                  <td>{formatLocalDate(item.packaging_completed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

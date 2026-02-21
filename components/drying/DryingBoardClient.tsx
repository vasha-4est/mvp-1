"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  formatTimeLeft,
  getRiskBadgeStyle,
  normalizeDryingPayload,
  type NormalizedDryingItem,
  sortDryingItems,
} from "./risk";

const REFRESH_INTERVAL_MS = 60_000;
const NOW_TICK_MS = 30_000;

function formatLocalDate(value: Date | null): string {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export default function DryingBoardClient() {
  const [items, setItems] = useState<NormalizedDryingItem[]>([]);
  const [search, setSearch] = useState("");
  const [showNoDate, setShowNoDate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());

  const controllerRef = useRef<AbortController | null>(null);

  const loadData = useCallback(async () => {
    controllerRef.current?.abort();
    const nextController = new AbortController();
    controllerRef.current = nextController;

    setIsLoading(true);

    try {
      const response = await fetch("/api/drying", {
        method: "GET",
        cache: "no-store",
        credentials: "include",
        signal: nextController.signal,
      });

      const payload = (await response.json().catch(() => null)) as unknown;

      if (!response.ok) {
        setError(`Could not load drying data (HTTP ${response.status}).`);
        setItems([]);
        return;
      }

      const fetchedAt = new Date();
      const normalized = normalizeDryingPayload(payload, fetchedAt);
      setItems(sortDryingItems(normalized));
      setError(null);
      setNow(fetchedAt);
      setLastUpdatedAt(fetchedAt);
    } catch (fetchError) {
      if (isAbortError(fetchError)) {
        return;
      }

      setError("Could not load drying data. Please try again.");
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

    const refreshIntervalId = window.setInterval(() => {
      loadData();
    }, REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(refreshIntervalId);
      controllerRef.current?.abort();
    };
  }, [loadData]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), NOW_TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (!showNoDate && item.risk === "NO_DATE") {
        return false;
      }

      if (!search.trim()) {
        return true;
      }

      return item.code.toLowerCase().includes(search.trim().toLowerCase());
    });
  }, [items, search, showNoDate]);

  return (
    <section style={{ padding: "16px 0" }}>
      <h1 style={{ marginBottom: 6 }}>Drying</h1>
      <p style={{ marginTop: 0, color: "#4b5563" }}>
        Read-only board of batches currently in drying.
      </p>

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

        <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <input
            type="checkbox"
            checked={showNoDate}
            onChange={(event) => setShowNoDate(event.target.checked)}
          />
          <span>Show NO_DATE rows (off by default)</span>
        </label>

        <button type="button" onClick={loadData} disabled={isLoading}>
          {isLoading ? "Loading..." : "Retry"}
        </button>
      </div>

      {lastUpdatedAt ? (
        <p style={{ marginTop: 0, color: "#6b7280" }}>
          Last updated: {new Intl.DateTimeFormat(undefined, { timeStyle: "medium" }).format(lastUpdatedAt)}
        </p>
      ) : null}

      {isLoading && !lastUpdatedAt ? <p style={{ color: "#6b7280" }}>Loading…</p> : null}

      {error ? (
        <p role="alert" style={{ color: "#991b1b", background: "#fef2f2", padding: "8px 10px" }}>
          {error}
        </p>
      ) : null}

      {!error && !isLoading && filteredItems.length === 0 ? <p>No batches in drying.</p> : null}

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th align="left">Code</th>
              <th align="left">Dry end at (local)</th>
              <th align="left">Time left</th>
              <th align="left">Risk</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item, index) => (
              <tr key={`${item.code}-${index}`}>
                <td style={{ padding: "8px 0" }}>{item.code}</td>
                <td>{formatLocalDate(item.dryEndAt)}</td>
                <td>{formatTimeLeft(item.dryEndAt, now)}</td>
                <td>
                  <span style={getRiskBadgeStyle(item.risk)}>{item.risk}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

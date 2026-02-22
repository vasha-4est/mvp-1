"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type QcBatch = {
  code: string;
  product: string;
  quantity: number;
  labeled_at: string;
};

type ApiPayload = {
  ok?: unknown;
  data?: unknown;
};

const REFRESH_INTERVAL_MS = 60_000;

function formatLocalDate(value: string): string {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) {
    return "—";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(ms));
}

function normalizePayload(payload: unknown): QcBatch[] {
  const body = typeof payload === "object" && payload !== null ? (payload as ApiPayload) : null;

  if (!body || body.ok !== true || !Array.isArray(body.data)) {
    return [];
  }

  return body.data
    .map((row) => {
      if (typeof row !== "object" || row === null) {
        return null;
      }

      const item = row as Record<string, unknown>;
      const code = typeof item.code === "string" ? item.code.trim() : "";
      const product = typeof item.product === "string" ? item.product.trim() : "";
      const quantityRaw = item.quantity;
      const quantity =
        typeof quantityRaw === "number"
          ? quantityRaw
          : typeof quantityRaw === "string"
            ? Number(quantityRaw)
            : Number.NaN;
      const labeledAt = typeof item.labeled_at === "string" ? item.labeled_at.trim() : "";

      if (!code || !product || !Number.isFinite(quantity) || !labeledAt) {
        return null;
      }

      return {
        code,
        product,
        quantity,
        labeled_at: labeledAt,
      } satisfies QcBatch;
    })
    .filter((item): item is QcBatch => item !== null)
    .sort((left, right) => Date.parse(left.labeled_at) - Date.parse(right.labeled_at));
}

export default function QcStationTable() {
  const [rows, setRows] = useState<QcBatch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showFailed, setShowFailed] = useState(false);

  const controllerRef = useRef<AbortController | null>(null);

  const loadData = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setIsLoading(true);

    try {
      const response = await fetch("/api/stations/qc", {
        method: "GET",
        cache: "no-store",
        credentials: "include",
        signal: controller.signal,
      });

      const payload = (await response.json().catch(() => null)) as unknown;

      if (!response.ok) {
        setRows([]);
        setError(`Could not load QC queue (HTTP ${response.status}).`);
        return;
      }

      setRows(normalizePayload(payload));
      setError(null);
    } catch (fetchError) {
      if (fetchError instanceof DOMException && fetchError.name === "AbortError") {
        return;
      }

      setRows([]);
      setError("Could not load QC queue. Please try again.");
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }

      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();

    const interval = window.setInterval(loadData, REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
      controllerRef.current?.abort();
    };
  }, [loadData]);

  const tableRows = useMemo(() => rows, [rows]);

  return (
    <section style={{ padding: "16px 0" }}>
      <h1 style={{ marginBottom: 6 }}>QC Station</h1>
      <p style={{ marginTop: 0, color: "#4b5563" }}>Read-only queue of labeled batches eligible for QC.</p>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={showFailed}
            onChange={(event) => setShowFailed(event.target.checked)}
          />
          <span>Show failed</span>
        </label>

        <button type="button" onClick={loadData} disabled={isLoading}>
          {isLoading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {isLoading && tableRows.length === 0 ? <p style={{ color: "#6b7280" }}>Loading…</p> : null}
      {error ? (
        <p role="alert" style={{ color: "#991b1b", background: "#fef2f2", padding: "8px 10px" }}>
          {error}
        </p>
      ) : null}
      {!error && !isLoading && tableRows.length === 0 ? <p>No labeled batches ready for QC.</p> : null}

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th align="left">Batch code</th>
              <th align="left">Product</th>
              <th align="left">Quantity</th>
              <th align="left">Labeled at</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row) => (
              <tr key={row.code}>
                <td style={{ padding: "8px 0" }}>{row.code}</td>
                <td>{row.product}</td>
                <td>{row.quantity}</td>
                <td>{formatLocalDate(row.labeled_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

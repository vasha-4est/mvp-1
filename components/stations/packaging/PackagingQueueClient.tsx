"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import PackagingQueueTable from "@/components/stations/packaging/PackagingQueueTable";
import type { PackagingQueueItem } from "@/lib/stations/packaging/getPackagingQueue";

type QueueApiResponse = {
  ok?: boolean;
  items?: unknown;
  error?: { message?: unknown };
};

type MeResponse = {
  ok?: boolean;
  user?: { id?: string };
};

function byCreatedAtAsc(left: PackagingQueueItem, right: PackagingQueueItem): number {
  const leftMs = Date.parse(left.created_at);
  const rightMs = Date.parse(right.created_at);
  if (!Number.isFinite(leftMs) && !Number.isFinite(rightMs)) return left.batch_code.localeCompare(right.batch_code);
  if (!Number.isFinite(leftMs)) return 1;
  if (!Number.isFinite(rightMs)) return -1;
  if (leftMs === rightMs) return left.batch_code.localeCompare(right.batch_code);
  return leftMs - rightMs;
}

function normalizeItems(raw: unknown): PackagingQueueItem[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((entry) => typeof entry === "object" && entry !== null)
    .map((entry) => {
      const item = entry as Partial<PackagingQueueItem>;
      return {
        batch_code: typeof item.batch_code === "string" ? item.batch_code : "",
        product: typeof item.product === "string" ? item.product : "—",
        quantity: typeof item.quantity === "number" && Number.isFinite(item.quantity) ? item.quantity : 0,
        created_at: typeof item.created_at === "string" ? item.created_at : "",
        assigned_to: typeof item.assigned_to === "string" && item.assigned_to.trim() ? item.assigned_to : null,
      };
    })
    .filter((item) => item.batch_code && item.created_at)
    .sort(byCreatedAtAsc);
}

export default function PackagingQueueClient() {
  const [items, setItems] = useState<PackagingQueueItem[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [busyByCode, setBusyByCode] = useState<Record<string, boolean>>({});

  const loadQueue = useCallback(async () => {
    try {
      const [queueRes, meRes] = await Promise.all([
        fetch("/api/stations/packaging", { method: "GET", cache: "no-store", credentials: "include" }),
        fetch("/api/auth/me", { method: "GET", cache: "no-store", credentials: "include" }),
      ]);

      const queuePayload = (await queueRes.json().catch(() => null)) as QueueApiResponse | null;
      const mePayload = (await meRes.json().catch(() => null)) as MeResponse | null;

      if (!queueRes.ok || queuePayload?.ok !== true) {
        const message =
          queuePayload?.error && typeof queuePayload.error.message === "string"
            ? queuePayload.error.message
            : `Could not load packaging queue (HTTP ${queueRes.status}).`;
        setItems([]);
        setError(message);
        return;
      }

      setCurrentUserId(mePayload?.ok === true && typeof mePayload.user?.id === "string" ? mePayload.user.id : null);
      setItems(normalizeItems(queuePayload.items));
      setError(null);
    } catch {
      setItems([]);
      setError("Could not load packaging queue. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const onAction = useCallback(async (batchCode: string, action: "take" | "release" | "advance") => {
    setBusyByCode((prev) => ({ ...prev, [batchCode]: true }));
    setError(null);

    try {
      const response = await fetch(`/api/stations/packaging/${action}`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ batch_code: batchCode }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
        const message = typeof payload?.error === "string" ? payload.error : `Action failed (HTTP ${response.status}).`;
        setError(message);
        return;
      }

      await loadQueue();
    } catch {
      setError("Action failed. Please try again.");
    } finally {
      setBusyByCode((prev) => ({ ...prev, [batchCode]: false }));
    }
  }, [loadQueue]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => item.batch_code.toLowerCase().includes(q));
  }, [items, search]);

  return (
    <section style={{ padding: "16px 0" }}>
      <h1 style={{ marginBottom: 6 }}>Packaging</h1>
      <p style={{ marginTop: 0, color: "#4b5563" }}>Queue of batches ready for packaging.</p>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span>Search batch code</span>
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="e.g. B-250215-001" style={{ padding: "6px 8px" }} />
      </label>
      {isLoading ? <p style={{ color: "#6b7280" }}>Loading…</p> : null}
      {error ? <p role="alert" style={{ color: "#991b1b", background: "#fef2f2", padding: "8px 10px" }}>{error}</p> : null}
      {!error && !isLoading && items.length === 0 ? <p>No batches ready for packaging.</p> : null}
      {!error && !isLoading && items.length > 0 && filtered.length === 0 ? <p>No matches.</p> : null}
      {!error && !isLoading && filtered.length > 0 ? (
        <PackagingQueueTable items={filtered} currentUserId={currentUserId} busyByCode={busyByCode} onAction={onAction} />
      ) : null}
    </section>
  );
}

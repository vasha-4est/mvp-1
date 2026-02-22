"use client";

import { useEffect, useMemo, useState } from "react";

import PackagingQueueTable from "@/components/stations/packaging/PackagingQueueTable";
import type { PackagingQueueItem } from "@/lib/stations/packaging/getPackagingQueue";

type QueueApiResponse = {
  ok?: boolean;
  items?: unknown;
  error?: {
    message?: unknown;
  };
};

function byCreatedAtAsc(left: PackagingQueueItem, right: PackagingQueueItem): number {
  const leftMs = Date.parse(left.created_at);
  const rightMs = Date.parse(right.created_at);

  if (!Number.isFinite(leftMs) && !Number.isFinite(rightMs)) {
    return left.batch_code.localeCompare(right.batch_code);
  }

  if (!Number.isFinite(leftMs)) {
    return 1;
  }

  if (!Number.isFinite(rightMs)) {
    return -1;
  }

  if (leftMs === rightMs) {
    return left.batch_code.localeCompare(right.batch_code);
  }

  return leftMs - rightMs;
}

function normalizeItems(raw: unknown): PackagingQueueItem[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter((entry) => typeof entry === "object" && entry !== null)
    .map((entry) => {
      const item = entry as Partial<PackagingQueueItem>;

      return {
        batch_code: typeof item.batch_code === "string" ? item.batch_code : "",
        product: typeof item.product === "string" ? item.product : "—",
        quantity: typeof item.quantity === "number" && Number.isFinite(item.quantity) ? item.quantity : 0,
        created_at: typeof item.created_at === "string" ? item.created_at : "",
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

  useEffect(() => {
    let active = true;

    async function loadQueue() {
      try {
        const response = await fetch("/api/stations/packaging", {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        });

        const payload = (await response.json().catch(() => null)) as QueueApiResponse | null;

        if (!response.ok || payload?.ok !== true) {
          const message =
            payload?.error && typeof payload.error.message === "string"
              ? payload.error.message
              : `Could not load packaging queue (HTTP ${response.status}).`;

          if (active) {
            setItems([]);
            setError(message);
          }
          return;
        }

        if (active) {
          setItems(normalizeItems(payload.items));
          setError(null);
        }
      } catch {
        if (active) {
          setItems([]);
          setError("Could not load packaging queue. Please try again.");
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    loadQueue();

    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      return items;
    }

    return items.filter((item) => item.batch_code.toLowerCase().includes(q));
  }, [items, search]);

  return (
    <section style={{ padding: "16px 0" }}>
      <h1 style={{ marginBottom: 6 }}>Packaging</h1>
      <p style={{ marginTop: 0, color: "#4b5563" }}>Read-only queue of batches ready for packaging.</p>

      <label style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span>Search batch code</span>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="e.g. B-250215-001"
          style={{ padding: "6px 8px" }}
        />
      </label>

      {isLoading ? <p style={{ color: "#6b7280" }}>Loading…</p> : null}

      {error ? (
        <p role="alert" style={{ color: "#991b1b", background: "#fef2f2", padding: "8px 10px" }}>
          {error}
        </p>
      ) : null}

      {!error && !isLoading && items.length === 0 ? <p>No batches ready for packaging.</p> : null}

      {!error && !isLoading && items.length > 0 && filtered.length === 0 ? <p>No matches.</p> : null}

      {!error && !isLoading && filtered.length > 0 ? <PackagingQueueTable items={filtered} /> : null}
    </section>
  );
}

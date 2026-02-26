"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type KpiCardConfig = {
  key: string;
  title: string;
  description: string;
  href: string;
  statusUrl: string;
};

type CardStatus = {
  generatedAt: string | null;
  warning: string | null;
};

const KPI_CARDS: KpiCardConfig[] = [
  {
    key: "deficit",
    title: "Deficit",
    description: "Missing SKU quantities and top deficit focus list.",
    href: "/kpi/deficit",
    statusUrl: "/api/kpi/deficit?limit_shipments=10&limit_picking=50",
  },
  {
    key: "throughput",
    title: "Throughput (daily)",
    description: "Daily operational throughput trend for key floor signals.",
    href: "/kpi/throughput",
    statusUrl: "/api/kpi/throughput?days=14",
  },
  {
    key: "throughput-shifts",
    title: "Throughput by Shifts",
    description: "Shift-by-shift throughput in Moscow time over the recent window.",
    href: "/kpi/throughput-shifts?days=14&tz=Europe%2FMoscow",
    statusUrl: "/api/kpi/throughput-shifts?days=14&tz=Europe/Moscow",
  },
  {
    key: "shipment-sla",
    title: "Shipment SLA",
    description: "SLA attainment and readiness timing for shipment operations.",
    href: "/kpi/shipment-sla?days=14&tz=Europe%2FMoscow&sla_hours=24",
    statusUrl: "/api/kpi/shipment-sla?days=14&tz=Europe/Moscow&sla_hours=24",
  },
  {
    key: "daily-summary",
    title: "Daily Summary",
    description: "Compact daily snapshot across operational KPI domains.",
    href: "/daily/summary?days=2",
    statusUrl: "/api/daily/summary?days=2",
  },
];

const INITIAL_STATUS: Record<string, CardStatus> = Object.fromEntries(
  KPI_CARDS.map((card) => [card.key, { generatedAt: null, warning: null }])
);

function formatDateTime(value: string | null): string {
  if (!value) {
    return "Unavailable";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString(undefined, {
    timeZone: "Europe/Moscow",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function KpiDashboardView() {
  const [statuses, setStatuses] = useState<Record<string, CardStatus>>(INITIAL_STATUS);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadStatuses = useCallback(async () => {
    setIsRefreshing(true);

    const requests = KPI_CARDS.map(async (card) => {
        const response = await fetch(card.statusUrl, { method: "GET", cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as { ok?: boolean; generated_at?: string; error?: string } | null;

        if (!response.ok || payload?.ok !== true) {
          const fallback = response.ok ? "Data source unavailable" : `Request failed (${response.status})`;
          return [card.key, { generatedAt: null, warning: payload?.error || fallback }] as const;
        }

        return [card.key, { generatedAt: payload.generated_at || null, warning: null }] as const;
      });

    const results = await Promise.allSettled(requests);
    const nextStatuses: Record<string, CardStatus> = { ...INITIAL_STATUS };

    results.forEach((result, index) => {
      const card = KPI_CARDS[index];
      if (!card) return;

      if (result.status === "fulfilled") {
        const [key, status] = result.value;
        nextStatuses[key] = status;
        return;
      }

      const reason = result.reason instanceof Error ? result.reason.message : "Unexpected error";
      nextStatuses[card.key] = { generatedAt: null, warning: reason };
    });

    setStatuses(nextStatuses);
    setIsRefreshing(false);
  }, []);

  useEffect(() => {
    void loadStatuses();
  }, [loadStatuses]);

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>KPI Dashboard</h1>
          <p style={{ margin: "6px 0 0", color: "#4b5563" }}>Control Tower KPI links and last refresh status (Europe/Moscow).</p>
        </div>
        <button type="button" onClick={loadStatuses} disabled={isRefreshing}>
          {isRefreshing ? "Refreshing..." : "Refresh statuses"}
        </button>
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        {KPI_CARDS.map((card) => {
          const status = statuses[card.key] || { generatedAt: null, warning: "Unavailable" };

          return (
            <article key={card.key} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, background: "#fff", display: "grid", gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: 17 }}>{card.title}</h2>
              <p style={{ margin: 0, color: "#4b5563" }}>{card.description}</p>
              <p style={{ margin: 0 }}>
                <strong>Last updated:</strong> {formatDateTime(status.generatedAt)}
              </p>
              {status.warning ? <p style={{ margin: 0, color: "#92400e", fontSize: 13 }}>Warning: {status.warning}</p> : null}
              <div>
                <Link href={card.href}>Open KPI →</Link>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

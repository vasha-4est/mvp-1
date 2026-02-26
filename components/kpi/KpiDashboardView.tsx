"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type KpiCardConfig = {
  key: string;
  title: string;
  description: string;
  href: string;
};

type AlertStatus = "ok" | "warn" | "alert" | "unknown";

type CardStatus = {
  generatedAt: string | null;
  warning: string | null;
  alertStatus: AlertStatus;
};

type AlertsPayload = {
  ok: true;
  generated_at?: string;
  items?: Array<{ kpi_key?: string; status?: AlertStatus }>;
  error?: string;
};

const KPI_CARDS: KpiCardConfig[] = [
  {
    key: "deficit",
    title: "Deficit",
    description: "Missing SKU quantities and top deficit focus list.",
    href: "/kpi/deficit",
  },
  {
    key: "throughput",
    title: "Throughput (daily)",
    description: "Daily operational throughput trend for key floor signals.",
    href: "/kpi/throughput",
  },
  {
    key: "throughput_shifts",
    title: "Throughput by Shifts",
    description: "Shift-by-shift throughput in Moscow time over the recent window.",
    href: "/kpi/throughput-shifts?days=14&tz=Europe%2FMoscow",
  },
  {
    key: "shipment_sla",
    title: "Shipment SLA",
    description: "SLA attainment and readiness timing for shipment operations.",
    href: "/kpi/shipment-sla?days=14&tz=Europe%2FMoscow&sla_hours=24",
  },
  {
    key: "daily_summary",
    title: "Daily Summary",
    description: "Compact daily snapshot across operational KPI domains.",
    href: "/daily/summary?days=2",
  },
];

const ALERTS_STATUS_URL = "/api/alerts/kpi?days=14&tz=Europe/Moscow&sla_hours=24";

const INITIAL_STATUS: Record<string, CardStatus> = Object.fromEntries(
  KPI_CARDS.map((card) => [card.key, { generatedAt: null, warning: null, alertStatus: "unknown" }])
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

function badgeColors(status: AlertStatus): { text: string; border: string; background: string } {
  switch (status) {
    case "ok":
      return { text: "#166534", border: "#86efac", background: "#f0fdf4" };
    case "warn":
      return { text: "#92400e", border: "#fcd34d", background: "#fffbeb" };
    case "alert":
      return { text: "#991b1b", border: "#fca5a5", background: "#fef2f2" };
    default:
      return { text: "#374151", border: "#d1d5db", background: "#f9fafb" };
  }
}

export default function KpiDashboardView() {
  const [statuses, setStatuses] = useState<Record<string, CardStatus>>(INITIAL_STATUS);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadStatuses = useCallback(async () => {
    setIsRefreshing(true);

    try {
      const response = await fetch(ALERTS_STATUS_URL, { method: "GET", cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as AlertsPayload | null;

      if (!response.ok || payload?.ok !== true) {
        const fallback = response.ok ? "Data source unavailable" : `Request failed (${response.status})`;
        const warning = payload?.error || fallback;

        setStatuses(
          Object.fromEntries(
            KPI_CARDS.map((card) => [card.key, { generatedAt: null, warning, alertStatus: "unknown" } satisfies CardStatus])
          )
        );
        return;
      }

      const itemsByKey = new Map((payload.items || []).map((item) => [item.kpi_key, item.status]));
      const generatedAt = payload.generated_at || null;

      setStatuses(
        Object.fromEntries(
          KPI_CARDS.map((card) => {
            const status = itemsByKey.get(card.key);
            const alertStatus: AlertStatus =
              status === "ok" || status === "warn" || status === "alert" || status === "unknown" ? status : "unknown";

            return [card.key, { generatedAt, warning: null, alertStatus } satisfies CardStatus];
          })
        )
      );
    } catch (error) {
      const warning = error instanceof Error ? error.message : "Unexpected error";
      setStatuses(
        Object.fromEntries(
          KPI_CARDS.map((card) => [card.key, { generatedAt: null, warning, alertStatus: "unknown" } satisfies CardStatus])
        )
      );
    } finally {
      setIsRefreshing(false);
    }
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
          const status = statuses[card.key] || { generatedAt: null, warning: "Unavailable", alertStatus: "unknown" as AlertStatus };
          const badgeColor = badgeColors(status.alertStatus);

          return (
            <article
              key={card.key}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                padding: 12,
                background: "#fff",
                display: "grid",
                gap: 8,
                boxShadow: status.alertStatus === "alert" ? "0 0 0 1px #fecaca inset" : "none",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <h2 style={{ margin: 0, fontSize: 17 }}>{card.title}</h2>
                <span
                  style={{
                    fontSize: 12,
                    lineHeight: 1,
                    padding: "4px 8px",
                    borderRadius: 999,
                    border: `1px solid ${badgeColor.border}`,
                    background: badgeColor.background,
                    color: badgeColor.text,
                    fontWeight: 600,
                  }}
                >
                  {status.alertStatus.toUpperCase()}
                </span>
              </div>
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

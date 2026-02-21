import { headers } from "next/headers";

import { requirePageRole } from "@/lib/server/guards";

type DashboardResponse = {
  ok?: boolean;
  data?: {
    counts?: {
      created?: number;
      production?: number;
      drying?: number;
      ready?: number;
      closed?: number;
      total_open?: number;
    };
    drying?: Array<{
      code?: string;
      dry_end_at?: string;
      dry_remaining_ms?: number;
      is_overdue?: boolean;
    }>;
    recent_events?: Array<{
      at?: string;
      batch_code?: string;
      type?: string;
      actor?: string;
      details?: unknown;
    }>;
    health?: {
      wip_total_open?: number;
      drying_overdue?: number;
      events_last_24h?: number;
      errors_last_24h?: number;
      last_event_at?: string | null;
    };
  };
  error?: unknown;
  code?: string;
};

function getRequestContext(): { origin: string; cookieHeader: string } {
  const h = headers();
  const protocol = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const cookieHeader = h.get("cookie") ?? "";

  if (!host) {
    return {
      origin: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
      cookieHeader,
    };
  }

  return {
    origin: `${protocol}://${host}`,
    cookieHeader,
  };
}

function formatRemaining(ms: number | undefined): string {
  if (typeof ms !== "number") {
    return "—";
  }

  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

function formatDetails(details: unknown): string {
  if (details === null || details === undefined) return "";
  if (typeof details === "string") return details;
  try {
    return JSON.stringify(details);
  } catch {
    return String(details);
  }
}

function ErrorState({ message, requestId }: { message: string; requestId: string }) {
  return (
    <main data-testid="owner-dashboard" style={{ display: "grid", gap: 12 }}>
      <h1>Owner Dashboard</h1>
      <section>
        <h2>Dashboard</h2>
        <div data-testid="owner-dashboard-error" role="alert">
          {message}
        </div>
        <small>request id: {requestId}</small>
      </section>
    </main>
  );
}

export default async function OwnerDashboardPage({
  searchParams,
}: {
  searchParams?: { debug?: string };
}) {
  requirePageRole("/owner", ["OWNER"]);

  const debugEnabled = searchParams?.debug === "1";
  const { origin, cookieHeader } = getRequestContext();
  const response = await fetch(
    `${origin}/api/owner/dashboard${debugEnabled ? "?debug=1" : ""}`,
    {
      cache: "no-store",
      headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    }
  );

  const requestId = response.headers.get("x-request-id") ?? "n/a";

  let payload: DashboardResponse | null = null;
  try {
    payload = (await response.json()) as DashboardResponse;
  } catch {
    return <ErrorState message="Failed to parse API response." requestId={requestId} />;
  }

  if (response.status === 401 || response.status === 403) {
    return <ErrorState message="Access denied." requestId={requestId} />;
  }

  if (!response.ok || payload?.ok === false) {
    return <ErrorState message="Failed to load dashboard." requestId={requestId} />;
  }

  const counts = payload?.data?.counts ?? {};
  const drying = Array.isArray(payload?.data?.drying) ? payload.data.drying : [];
  const recentEvents = Array.isArray(payload?.data?.recent_events) ? payload.data.recent_events : [];
  const health = payload?.data?.health ?? {};

  const metrics = [
    { label: "Total open", value: counts.total_open ?? 0 },
    { label: "Drying now", value: counts.drying ?? 0 },
    { label: "Drying overdue", value: health.drying_overdue ?? 0 },
    { label: "Events (24h)", value: health.events_last_24h ?? 0 },
  ];

  return (
    <main data-testid="owner-dashboard" style={{ display: "grid", gap: 20 }}>
      <h1>Owner Dashboard</h1>
      <section style={{ display: "grid", gap: 16 }}>
        <h2>Dashboard</h2>
        <div data-testid="owner-dashboard-loaded">ok</div>

        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          }}
        >
          {metrics.map((metric) => (
            <article
              key={metric.label}
              style={{
                border: "1px solid #ddd",
                borderRadius: 8,
                padding: 12,
                background: "#fff",
              }}
            >
              <p style={{ margin: 0, color: "#555" }}>{metric.label}</p>
              <p style={{ margin: "8px 0 0", fontSize: 24, fontWeight: 700 }}>{metric.value}</p>
            </article>
          ))}
        </div>
      </section>

      <section>
        <h2>WIP Summary</h2>
        <ul>
          <li>created: {counts.created ?? 0}</li>
          <li>production: {counts.production ?? 0}</li>
          <li>drying: {counts.drying ?? 0}</li>
          <li>ready: {counts.ready ?? 0}</li>
          <li>closed: {counts.closed ?? 0}</li>
          <li>total_open: {counts.total_open ?? 0}</li>
        </ul>
      </section>

      <section>
        <h2>Drying queue</h2>
        <table>
          <thead>
            <tr>
              <th align="left">Code</th>
              <th align="left">Dry end at</th>
              <th align="left">Remaining</th>
              <th align="left">Overdue</th>
            </tr>
          </thead>
          <tbody>
            {drying.map((item) => (
              <tr key={`${item.code}-${item.dry_end_at}`}>
                <td>{item.code ?? "—"}</td>
                <td>{item.dry_end_at ?? "—"}</td>
                <td>{formatRemaining(item.dry_remaining_ms)}</td>
                <td>{item.is_overdue ? "OVERDUE" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Recent events</h2>
        <ul>
          {recentEvents.map((event, index) => {
            const detailsLabel = formatDetails(event.details);

            return (
              <li key={`${event.at}-${event.type}-${event.batch_code}-${index}`}>
                {event.at ?? "—"} — {event.type ?? "—"} — {event.batch_code ?? "—"}
                {event.actor ? ` — ${event.actor}` : ""}
                {detailsLabel ? ` — ${detailsLabel}` : ""}
              </li>
            );
          })}
        </ul>
      </section>

      {debugEnabled ? (
        <section>
          <h2>Debug</h2>
          <pre
            style={{
              overflowX: "auto",
              padding: 12,
              border: "1px solid #ddd",
              borderRadius: 8,
              background: "#fafafa",
            }}
          >
            {JSON.stringify(payload, null, 2)}
          </pre>
        </section>
      ) : null}
    </main>
  );
}

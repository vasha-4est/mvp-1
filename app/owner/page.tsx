import { headers } from "next/headers";

import { AuthStatus } from "@/components/AuthStatus";

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

export default async function OwnerDashboardPage() {
  const { origin, cookieHeader } = getRequestContext();
  const response = await fetch(`${origin}/api/owner/dashboard`, {
    cache: "no-store",
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  });

  const requestId = response.headers.get("x-request-id") ?? "n/a";

  let payload: DashboardResponse | null = null;
  try {
    payload = (await response.json()) as DashboardResponse;
  } catch {
    return (
      <main>
        <h1>Owner Dashboard</h1>
        <AuthStatus />
        <p role="alert">Failed to parse API response.</p>
        <small>request id: {requestId}</small>
      </main>
    );
  }

  if (response.status === 401 || response.status === 403) {
    return (
      <main>
        <h1>Owner Dashboard</h1>
        <AuthStatus />
        <p role="alert">Access denied. <a href="/auth/login?returnTo=/owner">Login</a></p>
        <small>request id: {requestId}</small>
      </main>
    );
  }

  if (!response.ok || payload?.ok === false) {
    return (
      <main>
        <h1>Owner Dashboard</h1>
        <AuthStatus />
        <p role="alert">Failed to load dashboard.</p>
        <small>request id: {requestId}</small>
      </main>
    );
  }

  const counts = payload?.data?.counts ?? {};
  const drying = Array.isArray(payload?.data?.drying) ? payload.data.drying : [];
  const recentEvents = Array.isArray(payload?.data?.recent_events) ? payload.data.recent_events : [];
  const health = payload?.data?.health ?? {};

  return (
    <main style={{ display: "grid", gap: 20 }}>
      <h1>Owner Dashboard</h1>
      <AuthStatus />

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
          {recentEvents.map((event, index) => (
            <li key={`${event.at}-${event.type}-${event.batch_code}-${index}`}>
              {event.at ?? "—"} — {event.type ?? "—"} — {event.batch_code ?? "—"}
              {event.actor ? ` — ${event.actor}` : ""}
              {formatDetails(event.details) ? ` — ${formatDetails(event.details)}` : ""}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Health</h2>
        <ul>
          <li>wip_total_open: {health.wip_total_open ?? 0}</li>
          <li>drying_overdue: {health.drying_overdue ?? 0}</li>
          <li>events_last_24h: {health.events_last_24h ?? 0}</li>
          <li>errors_last_24h: {health.errors_last_24h ?? 0}</li>
          <li>last_event_at: {health.last_event_at ?? "—"}</li>
        </ul>
      </section>
    </main>
  );
}

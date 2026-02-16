import { headers } from "next/headers";

type BatchStatus = "created" | "production" | "drying" | "ready" | "closed";

type BatchCardResponse = {
  ok?: boolean;
  data?: {
    batch?: {
      code?: string;
      status?: string;
      created_at?: string;
      dry_end_at?: string | null;
      note?: string;
    };
    events?: Array<{
      at?: string;
      type?: string;
      actor?: string;
      details?: unknown;
      details_json?: unknown;
    }>;
    derived?: {
      status?: BatchStatus;
      is_drying?: boolean;
      dry_end_at?: string | null;
      dry_remaining_ms?: number | null;
      is_drying_overdue?: boolean | null;
      can_transition_to?: Record<string, boolean>;
    };
  };
  error?: unknown;
  code?: string;
  message?: string;
};

function getBaseUrl(): string {
  const headerStore = headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const protocol = headerStore.get("x-forwarded-proto") ?? "http";

  if (host) {
    return `${protocol}://${host}`;
  }

  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

function formatDryRemaining(ms: number | null | undefined): string {
  if (typeof ms !== "number" || ms < 0) {
    return "—";
  }

  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function formatUnknown(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value === null || value === undefined) {
    return "";
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function statusColor(status: string | undefined): string {
  if (status === "ready") return "#0f766e";
  if (status === "closed") return "#475569";
  if (status === "drying") return "#b45309";
  if (status === "production") return "#1d4ed8";
  return "#374151";
}

function parseDetails(details: unknown): string {
  if (details === null || details === undefined) {
    return "—";
  }

  if (typeof details === "string") {
    const trimmed = details.trim();
    if (!trimmed) {
      return "—";
    }

    try {
      const parsed = JSON.parse(trimmed);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return details;
    }
  }

  try {
    return JSON.stringify(details, null, 2);
  } catch {
    return String(details);
  }
}

export default async function BatchCardPage({ params }: { params: { code: string } }) {
  const code = decodeURIComponent(params.code);
  const response = await fetch(`${getBaseUrl()}/api/batch/${encodeURIComponent(code)}/card`, {
    method: "GET",
    cache: "no-store",
  });
  const requestId = response.headers.get("x-request-id");
  const bodyText = await response.text();

  let payload: BatchCardResponse | null = null;
  try {
    payload = JSON.parse(bodyText) as BatchCardResponse;
  } catch {
    const preview = bodyText.slice(0, 200);
    return (
      <main>
        <h1>Batch {code}</h1>
        <p role="alert">Error: INVALID_JSON_HTTP_{response.status} — {preview || "(empty response body)"}</p>
        {requestId ? <small style={{ color: "#6b7280" }}>request id: {requestId}</small> : null}
      </main>
    );
  }

  const isError = response.status !== 200 || payload?.ok === false;

  if (isError) {
    const errorMessage =
      formatUnknown(payload?.message) ||
      formatUnknown(payload?.error) ||
      `Request failed (HTTP ${response.status})`;

    return (
      <main>
        <h1>Batch {code}</h1>
        <p role="alert">Error: HTTP_{response.status} — {errorMessage}</p>
        {requestId ? <small style={{ color: "#6b7280" }}>request id: {requestId}</small> : null}
      </main>
    );
  }

  const batch = payload?.data?.batch ?? {};
  const derived = payload?.data?.derived ?? {};
  const events = Array.isArray(payload?.data?.events) ? payload.data.events : [];
  const displayStatus = derived.status ?? (batch.status as BatchStatus | undefined) ?? "created";
  const dryEndAt = derived.dry_end_at ?? batch.dry_end_at;
  const note = typeof batch.note === "string" ? batch.note.trim() : "";
  const transitions = derived.can_transition_to ?? {};

  return (
    <main style={{ display: "grid", gap: 16 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <h1 style={{ margin: 0 }}>Batch {code}</h1>
        <span
          style={{
            border: `1px solid ${statusColor(displayStatus)}`,
            color: statusColor(displayStatus),
            borderRadius: 999,
            fontSize: 12,
            padding: "2px 8px",
            textTransform: "uppercase",
          }}
        >
          {displayStatus}
        </span>
      </header>

      <section>
        <h2>Summary</h2>
        <dl>
          <dt>created_at</dt>
          <dd>{batch.created_at ?? "—"}</dd>

          <dt>dry_end_at</dt>
          <dd>{dryEndAt ?? "—"}</dd>

          {note ? (
            <>
              <dt>note</dt>
              <dd>{note}</dd>
            </>
          ) : null}
        </dl>
      </section>

      <section>
        <h2>Derived</h2>
        {derived.is_drying ? (
          <p>
            Dry remaining: {formatDryRemaining(derived.dry_remaining_ms)}
            {derived.is_drying_overdue ? " · Overdue" : ""}
          </p>
        ) : (
          <p>Not drying</p>
        )}

        <h3>can_transition_to</h3>
        <ul>
          {Object.entries(transitions).map(([key, value]) => (
            <li key={key}>
              {key}: {String(Boolean(value))}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Events</h2>
        {events.length === 0 ? (
          <p>No events yet</p>
        ) : (
          <ol>
            {events.map((event, index) => {
              const detailsValue = event.details_json ?? event.details;
              return (
                <li key={`${event.at ?? "event"}-${index}`} style={{ marginBottom: 12 }}>
                  <div>
                    <strong>{event.at ?? "—"}</strong> — <code>{event.type ?? "—"}</code>
                    {event.actor ? ` — ${event.actor}` : ""}
                  </div>
                  <pre style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>{parseDetails(detailsValue)}</pre>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <footer>
        {requestId ? <small style={{ color: "#6b7280" }}>request id: {requestId}</small> : null}
      </footer>
    </main>
  );
}

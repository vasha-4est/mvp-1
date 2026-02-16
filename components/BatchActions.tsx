"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type TransitionStatus = "production" | "drying" | "ready" | "closed";

type BatchActionsProps = {
  code: string;
  canTransitionTo: Record<string, boolean>;
  debug?: boolean;
};

type ActionError = {
  code: string;
  message: string;
  requestId: string;
};

type ActionSuccess = {
  status: TransitionStatus;
  requestId: string;
};

const ACTIONS: Array<{ label: string; toStatus: TransitionStatus }> = [
  { label: "Start production", toStatus: "production" },
  { label: "Move to drying", toStatus: "drying" },
  { label: "Mark ready", toStatus: "ready" },
  { label: "Close batch", toStatus: "closed" },
];

function createIdempotencyKey(target: TransitionStatus): string {
  return `ui-${target}-${Date.now()}`;
}

function getMessage(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value === null || value === undefined) {
    return "Transition failed";
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export default function BatchActions({ code, canTransitionTo, debug = false }: BatchActionsProps) {
  const router = useRouter();
  const [loadingStatus, setLoadingStatus] = useState<TransitionStatus | null>(null);
  const [error, setError] = useState<ActionError | null>(null);
  const [success, setSuccess] = useState<ActionSuccess | null>(null);

  const isLoading = loadingStatus !== null;
  const normalizedTransitions = useMemo(() => canTransitionTo ?? {}, [canTransitionTo]);

  useEffect(() => {
    if (!debug) {
      return;
    }

    console.info(`[BatchCard debug] read endpoint: /api/batch/${encodeURIComponent(code)}/card`);
  }, [code, debug]);

  async function handleTransition(toStatus: TransitionStatus) {
    setError(null);
    setSuccess(null);
    setLoadingStatus(toStatus);

    let requestId = "n/a";

    try {
      const response = await fetch(`/api/batch/${encodeURIComponent(code)}/status`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          to_status: toStatus,
          idempotency_key: createIdempotencyKey(toStatus),
        }),
      });

      requestId = response.headers.get("x-request-id") ?? "n/a";

      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; code?: string; error?: unknown }
        | null;

      const failed = !response.ok || payload?.ok === false;
      if (failed) {
        setError({
          code: payload?.code ?? `HTTP_${response.status}`,
          message: getMessage(payload?.error),
          requestId,
        });
        return;
      }

      const cardResponse = await fetch(`/api/batch/${encodeURIComponent(code)}/card`, {
        cache: "no-store",
      });

      if (debug) {
        console.info(`[BatchCard debug] read endpoint: /api/batch/${encodeURIComponent(code)}/card (status ${cardResponse.status})`);
      }

      if (!cardResponse.ok) {
        const cardPayload = (await cardResponse.json().catch(() => null)) as
          | { ok?: boolean; code?: string; error?: unknown }
          | null;

        setError({
          code: cardPayload?.code ?? `HTTP_${cardResponse.status}`,
          message: getMessage(cardPayload?.error) || "Failed to refresh batch card",
          requestId: cardResponse.headers.get("x-request-id") ?? requestId,
        });
        return;
      }

      setSuccess({ status: toStatus, requestId });
      router.refresh();
    } catch (fetchError) {
      setError({
        code: "NETWORK_ERROR",
        message: getMessage(fetchError),
        requestId,
      });
    } finally {
      setLoadingStatus(null);
    }
  }

  return (
    <section>
      <h2>Actions</h2>

      {error ? (
        <div
          role="alert"
          style={{
            marginBottom: 12,
            border: "1px solid #dc2626",
            color: "#991b1b",
            background: "#fef2f2",
            padding: "8px 10px",
          }}
        >
          <div>{`Error: ${error.code} — ${error.message}`}</div>
          <small>{`request_id: ${error.requestId}`}</small>
        </div>
      ) : null}

      {success ? (
        <p style={{ marginTop: 0, color: "#166534" }}>
          Updated to <strong>{success.status}</strong>. <small>{`request_id: ${success.requestId}`}</small>
        </p>
      ) : null}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {ACTIONS.map((action) => {
          const allowed = Boolean(normalizedTransitions[action.toStatus]);
          return (
            <button
              key={action.toStatus}
              type="button"
              onClick={() => handleTransition(action.toStatus)}
              disabled={isLoading || !allowed}
              aria-busy={loadingStatus === action.toStatus}
            >
              {loadingStatus === action.toStatus ? "Updating..." : action.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}

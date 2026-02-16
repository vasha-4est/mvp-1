"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

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

function getActionButtonStyle(disabled: boolean): { opacity: number; cursor: "pointer" | "not-allowed" } {
  if (disabled) {
    return {
      opacity: 0.6,
      cursor: "not-allowed",
    };
  }

  return {
    opacity: 1,
    cursor: "pointer",
  };
}

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
  const requestInFlightRef = useRef(false);

  const isLoading = loadingStatus !== null;
  const normalizedTransitions = useMemo(() => canTransitionTo ?? {}, [canTransitionTo]);

  useEffect(() => {
    if (!debug) {
      return;
    }

    console.info(`[BatchCard debug] read endpoint: /api/batch/${encodeURIComponent(code)}/card`);
  }, [code, debug]);

  async function handleTransition(toStatus: TransitionStatus) {
    if (requestInFlightRef.current) {
      return;
    }

    requestInFlightRef.current = true;
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
        const errorMessage = getMessage(payload?.error);
        setError({
          code: payload?.code ?? `HTTP_${response.status}`,
          message: errorMessage || "Transition failed",
          requestId,
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
      requestInFlightRef.current = false;
      setLoadingStatus(null);
    }
  }

  return (
    <section>
      <h2>Actions</h2>

      {success ? (
        <p style={{ marginTop: 0, color: "#166534" }}>
          Updated to <strong>{success.status}</strong>. <small>{`request_id: ${success.requestId}`}</small>
        </p>
      ) : null}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {ACTIONS.map((action) => {
          const allowed = normalizedTransitions[action.toStatus] === true;
          const isActionLoading = loadingStatus === action.toStatus;
          const isDisabled = isLoading || !allowed;

          return (
            <button
              key={action.toStatus}
              type="button"
              onClick={isDisabled ? undefined : () => handleTransition(action.toStatus)}
              disabled={isDisabled}
              aria-busy={isActionLoading}
              style={getActionButtonStyle(isDisabled)}
            >
              {isActionLoading ? `${action.label}...` : action.label}
            </button>
          );
        })}
      </div>

      {error ? (
        <div
          role="alert"
          style={{
            marginTop: 12,
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
    </section>
  );
}

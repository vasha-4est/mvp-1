const DEFAULT_TIMEOUT_MS = 12_000;

type GasResponse<T> = { ok: boolean; data?: T; error?: string | { code?: string; message?: string } };

type CallGasOptions = {
  timeoutMs?: number;
  retries?: number;
  retryBackoffMs?: number;
};

function shouldRetryTimeoutLike(error: string): boolean {
  const normalized = error.toLowerCase();
  return normalized.includes("timed out");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGasOnce<T>(
  action: string,
  payload: unknown,
  requestId: string,
  timeoutMs: number
): Promise<GasResponse<T>> {
  const baseUrl = process.env.GAS_WEBAPP_URL;
  const apiKey = process.env.GAS_API_KEY;

  if (!baseUrl) {
    throw new Error("Missing required environment variable: GAS_WEBAPP_URL");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-request-id": requestId,
      },
      body: JSON.stringify({
        action,
        payload,
        request_id: requestId,
        auth: apiKey ? { api_key: apiKey } : undefined,
      }),
      signal: controller.signal,
    });

    let json: unknown = null;
    try {
      json = await response.json();
    } catch {
      if (!response.ok) {
        return {
          ok: false,
          error: `GAS request failed with status ${response.status}`,
        };
      }

      return {
        ok: false,
        error: "GAS response was not valid JSON",
      };
    }

    if (!response.ok) {
      const errorMessage =
        typeof json === "object" &&
        json !== null &&
        "error" in json &&
        typeof (json as { error?: unknown }).error === "string"
          ? (json as { error: string }).error
          : `GAS request failed with status ${response.status}`;

      return { ok: false, error: errorMessage };
    }

    if (typeof json === "object" && json !== null && "ok" in json) {
      const result = json as GasResponse<T>;

      if (result.ok) {
        return { ok: true, data: result.data };
      }

      if (typeof result.error === "string") {
        return { ok: false, error: result.error };
      }

      if (result.error && typeof result.error === "object") {
        const code = typeof result.error.code === "string" ? result.error.code : "GAS_ERROR";
        const message = typeof result.error.message === "string" ? result.error.message : "GAS request failed";
        return { ok: false, error: `${code}: ${message}` };
      }

      return { ok: false, error: "GAS request failed" };
    }

    return { ok: true, data: json as T };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, error: "GAS request timed out" };
    }

    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown GAS request error",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function callGas<T>(
  action: string,
  payload: unknown,
  requestId: string,
  options?: CallGasOptions
): Promise<GasResponse<T>> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options?.retries ?? 0;
  const retryBackoffMs = options?.retryBackoffMs ?? 0;

  let attempt = 0;
  while (attempt <= retries) {
    const result = await callGasOnce<T>(action, payload, requestId, timeoutMs);
    if (result.ok) return result;

    const errorText =
      typeof result.error === "string"
        ? result.error
        : result.error && typeof result.error === "object" && typeof result.error.message === "string"
          ? result.error.message
          : "";

    const retryable = shouldRetryTimeoutLike(errorText);
    if (!retryable || attempt === retries) {
      return result;
    }

    attempt += 1;
    if (retryBackoffMs > 0) {
      await sleep(retryBackoffMs * attempt);
    }
  }

  return { ok: false, error: "GAS request failed" };
}

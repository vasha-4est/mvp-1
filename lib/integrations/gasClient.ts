const DEFAULT_TIMEOUT_MS = 12_000;

type GasResponse<T> = { ok: boolean; data?: T; error?: string };

export async function callGas<T>(
  action: string,
  payload: unknown,
  requestId: string
): Promise<GasResponse<T>> {
  const baseUrl = process.env.GAS_WEBAPP_URL;

  if (!baseUrl) {
    throw new Error("Missing required environment variable: GAS_WEBAPP_URL");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action,
        payload,
        request_id: requestId,
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

      return { ok: false, error: result.error ?? "GAS request failed" };
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

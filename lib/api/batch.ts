import { BatchListFilters, serializeBatchFilters, validateBatchFilters } from "../query/filters";

export type BatchListItem = {
  code?: string;
  status?: string;
  created_at?: string;
  dry_end_at?: string;
};

type ApiEnvelope = {
  ok?: boolean;
  data?: unknown;
  error?: unknown;
};

function normalizeErrorMessage(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim() !== "") {
    return value;
  }

  if (value === undefined || value === null) {
    return fallback;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

function withEnvironmentHint(message: string): string {
  const lower = message.toLowerCase();
  const needsPreviewHint =
    lower.includes("unauthorized") ||
    lower.includes("missing required environment variable") ||
    lower.includes("gas_webapp_url") ||
    lower.includes("gas_api_key");

  if (!needsPreviewHint) {
    return message;
  }

  return `${message}. Check Preview environment variables: GAS_API_KEY and GAS_WEBAPP_URL.`;
}

function extractItems(data: unknown): BatchListItem[] {
  if (Array.isArray(data)) {
    return data as BatchListItem[];
  }

  if (typeof data === "object" && data !== null && "items" in data) {
    const items = (data as { items?: unknown }).items;
    if (Array.isArray(items)) {
      return items as BatchListItem[];
    }
  }

  return [];
}

export async function listBatches(
  filters: BatchListFilters = {},
  options: { baseUrl: string }
): Promise<{
  items: BatchListItem[];
  error: string | null;
  validationError: string | null;
}> {
  const validationError = validateBatchFilters(filters);
  if (validationError) {
    return { items: [], error: null, validationError };
  }

  const query = serializeBatchFilters(filters);
  const apiKey = process.env.GAS_API_KEY;

  const response = await fetch(`${options.baseUrl}/api/batch${query}`, {
    method: "GET",
    cache: "no-store",
    headers: apiKey ? { "x-gas-api-key": apiKey } : undefined,
  });

  let payload: ApiEnvelope | null = null;
  try {
    payload = (await response.json()) as ApiEnvelope;
  } catch {
    return {
      items: [],
      error: `Failed to parse API response (HTTP ${response.status})`,
      validationError: null,
    };
  }

  if (!response.ok || payload?.ok === false) {
    const message = normalizeErrorMessage(payload?.error, `API request failed (HTTP ${response.status})`);

    return {
      items: [],
      error: withEnvironmentHint(message),
      validationError: null,
    };
  }

  return { items: extractItems(payload?.data), error: null, validationError: null };
}

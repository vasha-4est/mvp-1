import { callGas } from "@/lib/integrations/gasClient";

type ReadRetryOptions = {
  timeoutMs?: number;
  retries?: number;
  retryBackoffMs?: number;
};

const DEFAULT_READ_RETRY: Required<ReadRetryOptions> = {
  timeoutMs: 25_000,
  retries: 2,
  retryBackoffMs: 500,
};

export async function callGasRead<T>(
  action: string,
  payload: unknown,
  requestId: string,
  options?: ReadRetryOptions
) {
  return callGas<T>(action, payload, requestId, {
    timeoutMs: options?.timeoutMs ?? DEFAULT_READ_RETRY.timeoutMs,
    retries: options?.retries ?? DEFAULT_READ_RETRY.retries,
    retryBackoffMs: options?.retryBackoffMs ?? DEFAULT_READ_RETRY.retryBackoffMs,
  });
}

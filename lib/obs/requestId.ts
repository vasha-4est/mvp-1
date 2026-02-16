import { randomUUID } from "crypto";

const REQUEST_ID_HEADER = "x-request-id";

export function getOrCreateRequestId(request: Request): string {
  const fromHeader = request.headers.get(REQUEST_ID_HEADER);
  if (typeof fromHeader === "string" && fromHeader.trim().length > 0) {
    return fromHeader.trim();
  }

  return randomUUID();
}

export { REQUEST_ID_HEADER };

import { createHmac, timingSafeEqual } from "crypto";

type SessionPayload = {
  role: string;
  exp: number;
};

function getSessionSecret(): string {
  return process.env.SESSION_SECRET ?? "";
}

function toBase64(input: string): string {
  return Buffer.from(input, "utf8").toString("base64");
}

function fromBase64(input: string): string | null {
  try {
    return Buffer.from(input, "base64").toString("utf8");
  } catch {
    return null;
  }
}

function signPayload(encodedPayload: string): string {
  const secret = getSessionSecret();
  return createHmac("sha256", secret).update(encodedPayload).digest("base64");
}

export function signSession(payload: SessionPayload): string {
  const encodedPayload = toBase64(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifySession(token: string): { role: string } | null {
  const separator = token.indexOf(".");
  if (separator <= 0) {
    return null;
  }

  const encodedPayload = token.slice(0, separator);
  const encodedSignature = token.slice(separator + 1);
  if (!encodedPayload || !encodedSignature) {
    return null;
  }

  const expectedSignature = signPayload(encodedPayload);
  const providedBuffer = Buffer.from(encodedSignature, "base64");
  const expectedBuffer = Buffer.from(expectedSignature, "base64");

  if (providedBuffer.length !== expectedBuffer.length) {
    return null;
  }

  if (!timingSafeEqual(providedBuffer, expectedBuffer)) {
    return null;
  }

  const payloadJson = fromBase64(encodedPayload);
  if (!payloadJson) {
    return null;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(payloadJson);
  } catch {
    return null;
  }

  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return null;
  }

  const role = (payload as SessionPayload).role;
  const exp = (payload as SessionPayload).exp;

  if (typeof role !== "string" || !role.trim()) {
    return null;
  }

  if (typeof exp !== "number" || !Number.isFinite(exp)) {
    return null;
  }

  if (Date.now() >= exp * 1000) {
    return null;
  }

  return { role: role.trim().toLowerCase() };
}

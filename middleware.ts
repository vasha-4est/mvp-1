import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/auth";

const USER_ROLE_HEADER = "x-user-role";

const encoder = new TextEncoder();

function b64ToBytes(input: string): Uint8Array {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const decoded = atob(padded);
  const bytes = new Uint8Array(decoded.length);

  for (let i = 0; i < decoded.length; i += 1) {
    bytes[i] = decoded.charCodeAt(i);
  }

  return bytes;
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;

  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) {
    mismatch |= left[i] ^ right[i];
  }

  return mismatch === 0;
}

async function verifySessionRole(token: string): Promise<string | null> {
  const separator = token.indexOf(".");
  if (separator <= 0) {
    return null;
  }

  const encodedPayload = token.slice(0, separator);
  const encodedSignature = token.slice(separator + 1);

  const secret = process.env.SESSION_SECRET ?? "";
  if (!encodedPayload || !encodedSignature || !secret) {
    return null;
  }

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(encodedPayload))
  );

  const providedSignatureBytes = b64ToBytes(encodedSignature);
  if (!bytesEqual(providedSignatureBytes, signatureBytes)) {
    return null;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(b64ToBytes(encodedPayload)));
  } catch {
    return null;
  }

  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return null;
  }

  const role = (payload as { role?: unknown }).role;
  const exp = (payload as { exp?: unknown }).exp;

  if (typeof role !== "string" || !role.trim()) {
    return null;
  }

  if (typeof exp !== "number" || !Number.isFinite(exp) || Date.now() >= exp * 1000) {
    return null;
  }

  return role.trim().toLowerCase();
}

export async function middleware(request: NextRequest) {
  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const role = sessionToken ? await verifySessionRole(sessionToken) : null;

  const requestHeaders = new Headers(request.headers);
  if (role) {
    requestHeaders.set(USER_ROLE_HEADER, role);
  } else {
    requestHeaders.delete(USER_ROLE_HEADER);
  }

  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith("/api/owner") || pathname === "/owner") {
    if (!role) {
      return NextResponse.json({ ok: false, error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
    }

    if (role !== "owner") {
      return NextResponse.json({ ok: false, error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
    }
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: ["/api/:path*", "/owner"],
};

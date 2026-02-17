export type OwnerAuthResult =
  | { ok: true; role: string }
  | { ok: false; status: 401 | 403; code: "UNAUTHORIZED" | "FORBIDDEN"; message: string };

const ROLE_COOKIE_CANDIDATES = ["role", "user_role", "actor_role"];
const ROLE_HEADER_CANDIDATES = ["x-user-role", "x-role", "x-actor-role"];

function parseCookieHeader(cookieHeader: string): Record<string, string> {
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, entry) => {
      const separator = entry.indexOf("=");
      if (separator <= 0) {
        return acc;
      }

      const key = decodeURIComponent(entry.slice(0, separator).trim());
      const value = decodeURIComponent(entry.slice(separator + 1).trim());
      if (key) {
        acc[key] = value;
      }

      return acc;
    }, {});
}

function resolveRoleFromRequest(request: Request): string | null {
  for (const headerName of ROLE_HEADER_CANDIDATES) {
    const headerValue = request.headers.get(headerName);
    if (headerValue && headerValue.trim()) {
      return headerValue.trim().toLowerCase();
    }
  }

  const cookieHeader = request.headers.get("cookie") ?? "";
  if (!cookieHeader.trim()) {
    return null;
  }

  const cookies = parseCookieHeader(cookieHeader);
  for (const cookieName of ROLE_COOKIE_CANDIDATES) {
    const value = cookies[cookieName];
    if (value && value.trim()) {
      return value.trim().toLowerCase();
    }
  }

  return null;
}

export function authorizeOwner(request: Request): OwnerAuthResult {
  const role = resolveRoleFromRequest(request);

  if (!role) {
    return {
      ok: false,
      status: 401,
      code: "UNAUTHORIZED",
      message: "Unauthorized",
    };
  }

  if (role !== "owner") {
    return {
      ok: false,
      status: 403,
      code: "FORBIDDEN",
      message: "Forbidden",
    };
  }

  return { ok: true, role };
}

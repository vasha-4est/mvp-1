export type OwnerAuthResult =
  | { ok: true; role: string }
  | { ok: false; status: 401 | 403; code: "UNAUTHORIZED" | "FORBIDDEN"; message: string };

function resolveRoleFromRequest(request: Request): string | null {
  const headerValue = request.headers.get("x-user-role");
  if (!headerValue || !headerValue.trim()) {
    return null;
  }

  return headerValue.trim().toLowerCase();
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

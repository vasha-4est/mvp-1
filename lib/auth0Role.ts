import { isAllowedRole } from "@/lib/auth";

type Auth0SessionLike = {
  user?: {
    email?: unknown;
    role?: unknown;
    [key: string]: unknown;
  };
};

function normalizeCsvSet(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );
}

function roleFromClaimValue(value: unknown): "OWNER" | "COO" | "VIEWER" | null {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!isAllowedRole(normalized)) {
    return null;
  }

  return normalized;
}

export function roleFromAuth0Session(session: Auth0SessionLike): "OWNER" | "COO" | "VIEWER" | null {
  const claimName = process.env.AUTH0_ROLE_CLAIM?.trim() || "https://mvp-1/role";
  const user = session?.user;

  const directRole = roleFromClaimValue(user?.[claimName] ?? user?.role);
  if (directRole) {
    return directRole;
  }

  const email = typeof user?.email === "string" ? user.email.trim().toLowerCase() : "";
  if (!email) {
    return null;
  }

  const ownerEmails = normalizeCsvSet(process.env.OWNER_EMAILS);
  if (ownerEmails.has(email)) {
    return "OWNER";
  }

  const cooEmails = normalizeCsvSet(process.env.COO_EMAILS);
  if (cooEmails.has(email)) {
    return "COO";
  }

  return null;
}

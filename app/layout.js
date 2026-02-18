import Link from "next/link";
import { headers } from "next/headers";

export const metadata = {
  title: "MVP-1",
};

async function getSessionUser() {
  const h = headers();
  const protocol = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const cookie = h.get("cookie") ?? "";

  if (!host) {
    return null;
  }

  const response = await fetch(`${protocol}://${host}/api/auth/me`, {
    cache: "no-store",
    headers: cookie ? { cookie } : undefined,
  }).catch(() => null);

  if (!response || !response.ok) {
    return null;
  }

  const payload = await response.json().catch(() => null);
  return payload?.user ?? null;
}

export default async function RootLayout({ children }) {
  const user = await getSessionUser();
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  const isOwner = roles.includes("OWNER");

  return (
    <html lang="en">
      <body>
        <header style={{ padding: 12, borderBottom: "1px solid #ddd", marginBottom: 16 }}>
          <nav style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <Link href="/">Home</Link>
            <Link href="/batches">Batches</Link>
            {isOwner ? <Link href="/owner/users">Owner</Link> : null}
            <Link href="/login">Login</Link>
            <span style={{ marginLeft: "auto", fontSize: 12, opacity: 0.8 }}>
              role: {roles.length ? roles.join(", ") : "guest"}
            </span>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}

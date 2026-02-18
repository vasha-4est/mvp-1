"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type MePayload = {
  ok?: boolean;
  user?: {
    id?: string;
    login?: string;
    roles?: string[];
    must_change_password?: boolean;
  };
};

export default function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [roles, setRoles] = useState<string[]>([]);
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (res) => {
        if (!mounted) return;
        if (!res.ok) {
          setIsAuthed(false);
          setRoles([]);
          return;
        }

        const payload = (await res.json()) as MePayload;
        const nextRoles = Array.isArray(payload?.user?.roles) ? payload.user.roles : [];
        setRoles(nextRoles);
        setIsAuthed(nextRoles.length > 0);
      })
      .catch(() => {
        if (!mounted) return;
        setIsAuthed(false);
        setRoles([]);
      });

    return () => {
      mounted = false;
    };
  }, [pathname]);

  const isOwner = useMemo(() => roles.some((role) => role.toUpperCase() === "OWNER"), [roles]);

  async function onLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        padding: "12px 16px",
        borderBottom: "1px solid #ddd",
      }}
    >
      <nav style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Link href="/">Home</Link>
        <Link href="/batches">Batches</Link>
        {isOwner ? <Link href="/owner">Owner</Link> : null}
      </nav>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span>role: {roles.length > 0 ? roles.join(", ") : "guest"}</span>
        {isAuthed ? (
          <button type="button" onClick={onLogout}>
            Logout
          </button>
        ) : (
          <Link href="/login">Login</Link>
        )}
      </div>
    </header>
  );
}

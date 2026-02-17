"use client";

import { useEffect, useState } from "react";

type AuthState =
  | { loading: true; role: null }
  | { loading: false; role: string | null };

export function AuthStatus() {
  const [auth, setAuth] = useState<AuthState>({ loading: true, role: null });

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        if (!mounted) return;

        if (!response.ok) {
          setAuth({ loading: false, role: null });
          return;
        }

        const payload = (await response.json()) as { role?: unknown };
        const role = typeof payload.role === "string" ? payload.role : null;
        setAuth({ loading: false, role });
      } catch {
        if (!mounted) return;
        setAuth({ loading: false, role: null });
      }
    };

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  const onLogout = () => {
    window.location.href = "/auth/logout";
  };

  return (
    <section aria-label="Auth status" style={{ marginBottom: 16 }}>
      <strong>Auth status:</strong>{" "}
      {auth.loading ? "Loading…" : auth.role ? `Role: ${auth.role}` : "Not logged in"}
      <div style={{ marginTop: 8 }}>
        {!auth.role ? (
          <a href="/auth/login">Login</a>
        ) : (
          <button type="button" onClick={onLogout}>
            Logout
          </button>
        )}
      </div>
    </section>
  );
}

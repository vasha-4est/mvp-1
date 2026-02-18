"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const next = searchParams.get("next") || "/batches";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const payload = (await response.json().catch(() => null)) as { code?: string; error?: string } | null;

    if (!response.ok) {
      if (payload?.code === "INVALID_CREDENTIALS") {
        setError("Invalid username or password. Please try again.");
      } else {
        setError(payload?.error || "Unable to login.");
      }
      setLoading(false);
      return;
    }

    router.push(next);
    router.refresh();
  }

  return (
    <main style={{ maxWidth: 420, margin: "40px auto", padding: 16 }}>
      <h1>Login</h1>
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          Username
          <input value={username} onChange={(event) => setUsername(event.target.value)} required />
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          Password
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            required
          />
        </label>
        {error ? (
          <p role="alert" style={{ color: "#b42318", margin: 0 }}>
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={loading}
          style={{ opacity: loading ? 0.6 : 1, cursor: loading ? "not-allowed" : "pointer" }}
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </main>
  );
}

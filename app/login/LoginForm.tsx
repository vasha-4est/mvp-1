"use client";

import { FormEvent, useState } from "react";

export default function LoginForm({ nextPath }: { nextPath: string }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password }),
      });

      const body = (await response.json().catch(() => null)) as { error?: unknown; must_change_password?: unknown } | null;

      if (!response.ok) {
        const message = typeof body?.error === "string" ? body.error : "Login failed";
        setError(message);
        return;
      }

      if (body?.must_change_password === true) {
        window.location.assign(`/first-login?next=${encodeURIComponent(nextPath || "/")}`);
        return;
      }

      window.location.assign(nextPath || "/");
    } catch {
      setError("Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 8 }}>
      <label htmlFor="username">Username</label>
      <input
        id="username"
        name="username"
        autoComplete="username"
        value={username}
        onChange={(event) => setUsername(event.target.value)}
        required
      />

      <label htmlFor="password">Password</label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
      />

      <button type="submit" disabled={submitting}>
        {submitting ? "Signing in..." : "Sign in"}
      </button>

      {error ? (
        <p role="alert" aria-live="polite">
          {error}
        </p>
      ) : null}
    </form>
  );
}

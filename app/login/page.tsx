"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type LoginPayload = {
  ok?: boolean;
  code?: string;
  error?: string;
  must_change_password?: boolean;
};

export default function LoginPage() {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: login, password }),
      });

      const payload = (await response.json()) as LoginPayload;
      if (!response.ok || payload.ok === false) {
        if (response.status === 401 && payload.code === "INVALID_CREDENTIALS") {
          setError("Invalid username or password");
        } else {
          setError(payload.error ?? payload.code ?? "Login failed");
        }
        return;
      }

      if (payload.must_change_password === true) {
        router.push("/first-login");
        return;
      }

      router.push("/batches");
    } catch {
      setError("Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 460, margin: "24px auto", display: "grid", gap: 12 }}>
      <h1>Login</h1>
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 10 }}>
        <label>
          Login
          <input value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" required />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error ? <p role="alert">{error}</p> : null}
        <button type="submit" disabled={loading}>
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </main>
  );
}

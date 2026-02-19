"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ login, password }),
    });

    const payload = await response.json();
    if (!response.ok || !payload?.ok) {
      setError(payload?.error ?? "Login failed");
      return;
    }

    if (payload.must_change_password) {
      router.push("/first-login");
      return;
    }

    router.push("/owner");
  };

  return (
    <main style={{ maxWidth: 360, margin: "4rem auto", fontFamily: "sans-serif" }}>
      <h1>Login</h1>
      <form onSubmit={onSubmit} style={{ display: "grid", gap: "0.75rem" }}>
        <input value={login} onChange={(event) => setLogin(event.target.value)} placeholder="login" />
        <input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="password"
          type="password"
        />
        <button type="submit">Sign in</button>
      </form>
      {error ? <p style={{ color: "crimson" }}>{error}</p> : null}
    </main>
  );
}

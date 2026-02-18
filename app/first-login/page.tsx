"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type ChangePasswordPayload = {
  ok?: boolean;
  code?: string;
  error?: string;
};

export default function FirstLoginPage() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError("Password confirmation does not match");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ new_password: newPassword }),
      });

      const payload = (await response.json()) as ChangePasswordPayload;
      if (!response.ok || payload.ok === false) {
        setError(payload.error ?? payload.code ?? "Failed to change password");
        return;
      }

      router.push("/batches");
    } catch {
      setError("Failed to change password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 500, margin: "24px auto", display: "grid", gap: 12 }}>
      <h1>First login: change password</h1>
      <p>Your temporary password must be changed before you can continue.</p>
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 10 }}>
        <label>
          New password
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </label>
        <label>
          Confirm new password
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </label>
        {error ? <p role="alert">{error}</p> : null}
        <button type="submit" disabled={loading}>
          {loading ? "Saving..." : "Set new password"}
        </button>
      </form>
    </main>
  );
}

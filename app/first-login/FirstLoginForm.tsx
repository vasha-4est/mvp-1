"use client";

import { FormEvent, useState } from "react";

export default function FirstLoginForm({ nextPath }: { nextPath: string }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ new_password: newPassword }),
      });

      const body = (await response.json().catch(() => null)) as { error?: unknown } | null;

      if (!response.ok) {
        const message = typeof body?.error === "string" ? body.error : "Failed to change password";
        setError(message);
        return;
      }

      window.location.assign(nextPath || "/batches");
    } catch {
      setError("Failed to change password");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 8 }}>
      <label htmlFor="new_password">New password</label>
      <input
        id="new_password"
        name="new_password"
        type="password"
        autoComplete="new-password"
        value={newPassword}
        onChange={(event) => setNewPassword(event.target.value)}
        required
      />

      <label htmlFor="confirm_password">Confirm password</label>
      <input
        id="confirm_password"
        name="confirm_password"
        type="password"
        autoComplete="new-password"
        value={confirmPassword}
        onChange={(event) => setConfirmPassword(event.target.value)}
        required
      />

      <button type="submit" disabled={submitting}>
        {submitting ? "Saving..." : "Set password"}
      </button>

      {error ? (
        <p role="alert" aria-live="polite">
          {error}
        </p>
      ) : null}
    </form>
  );
}

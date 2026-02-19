"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function FirstLoginPage() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [status, setStatus] = useState("");

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("");

    const response = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ new_password: newPassword }),
    });

    const payload = await response.json();
    if (!response.ok || !payload?.ok) {
      setStatus(payload?.error ?? "Unable to change password");
      return;
    }

    router.push("/owner");
  };

  return (
    <main style={{ maxWidth: 400, margin: "4rem auto", fontFamily: "sans-serif" }}>
      <h1>First login — set password</h1>
      <form onSubmit={submit} style={{ display: "grid", gap: "0.75rem" }}>
        <input
          type="password"
          placeholder="New password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
        />
        <button type="submit">Save password</button>
      </form>
      {status ? <p>{status}</p> : null}
    </main>
  );
}

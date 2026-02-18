"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";

const ROLE_OPTIONS = ["OWNER", "COO", "VIEWER", "PROD_MASTER", "PACKER", "LOGISTICS"];

type UserDetails = {
  user_id: string;
  username: string;
  status: "active" | "disabled";
  roles: string[];
  last_login_at: string | null;
};

export default function OwnerUserDetailsPage() {
  const params = useParams<{ user_id: string }>();
  const userId = params.user_id;

  const [user, setUser] = useState<UserDetails | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [status, setStatus] = useState<"active" | "disabled">("active");
  const [password, setPassword] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggleRole(role: string) {
    setRoles((prev) => (prev.includes(role) ? prev.filter((item) => item !== role) : [...prev, role]));
  }

  async function loadUser() {
    const response = await fetch(`/api/owner/users/${encodeURIComponent(userId)}`, { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      setError(payload?.error || "Failed to load user");
      return;
    }

    const loaded = payload.data.user as UserDetails;
    setUser(loaded);
    setRoles(Array.isArray(loaded.roles) ? loaded.roles : []);
    setStatus(loaded.status);
    setError(null);
  }

  async function saveRolesAndStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    const roleResponse = await fetch(`/api/owner/users/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roles, notes }),
    });

    if (!roleResponse.ok) {
      const payload = await roleResponse.json().catch(() => null);
      setError(payload?.error || "Failed to update roles");
      return;
    }

    const statusResponse = await fetch(`/api/owner/users/${encodeURIComponent(userId)}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });

    if (!statusResponse.ok) {
      const payload = await statusResponse.json().catch(() => null);
      setError(payload?.error || "Failed to update status");
      return;
    }

    setMessage("User updated.");
    await loadUser();
  }

  async function resetPassword() {
    setMessage(null);
    setError(null);

    const response = await fetch(`/api/owner/users/${encodeURIComponent(userId)}/password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload?.ok) {
      setError(payload?.error || "Failed to reset password");
      return;
    }

    setPassword("");
    setMessage("Password reset.");
  }

  useEffect(() => {
    if (userId) {
      void loadUser();
    }
  }, [userId]);

  return (
    <main style={{ maxWidth: 720, padding: 16 }}>
      <h1>Edit user</h1>
      {user ? (
        <p>
          {user.username} ({user.user_id}) — last login: {user.last_login_at || "—"}
        </p>
      ) : null}
      {error ? (
        <p role="alert" style={{ color: "#b42318" }}>
          {error}
        </p>
      ) : null}
      {message ? <p style={{ color: "#067647" }}>{message}</p> : null}

      <form onSubmit={saveRolesAndStatus} style={{ display: "grid", gap: 12 }}>
        <fieldset style={{ display: "grid", gap: 6 }}>
          <legend>roles</legend>
          {ROLE_OPTIONS.map((role) => (
            <label key={role} style={{ display: "flex", gap: 8 }}>
              <input type="checkbox" checked={roles.includes(role)} onChange={() => toggleRole(role)} />
              {role}
            </label>
          ))}
        </fieldset>

        <label style={{ display: "grid", gap: 6 }}>
          status
          <select value={status} onChange={(event) => setStatus(event.target.value === "disabled" ? "disabled" : "active")}>
            <option value="active">active</option>
            <option value="disabled">disabled</option>
          </select>
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          notes (optional)
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />
        </label>

        <button
          type="submit"
          disabled={roles.length === 0}
          style={{ opacity: roles.length === 0 ? 0.6 : 1, cursor: roles.length === 0 ? "not-allowed" : "pointer" }}
        >
          Save changes
        </button>
      </form>

      <section style={{ marginTop: 24, display: "grid", gap: 8 }}>
        <h2>Reset password</h2>
        <input
          type="password"
          placeholder="New password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <button
          type="button"
          onClick={() => void resetPassword()}
          disabled={!password.trim()}
          style={{ opacity: !password.trim() ? 0.6 : 1, cursor: !password.trim() ? "not-allowed" : "pointer" }}
        >
          Reset password
        </button>
      </section>
    </main>
  );
}

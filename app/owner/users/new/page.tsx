"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const ROLE_OPTIONS = ["OWNER", "COO", "VIEWER", "PROD_MASTER", "PACKER", "LOGISTICS"];

export default function NewOwnerUserPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"active" | "disabled">("active");
  const [roles, setRoles] = useState<string[]>(["VIEWER"]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function toggleRole(role: string) {
    setRoles((prev) => (prev.includes(role) ? prev.filter((item) => item !== role) : [...prev, role]));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const response = await fetch("/api/owner/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password, roles, status }),
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload?.ok) {
      setError(payload?.error || "Failed to create user");
      setLoading(false);
      return;
    }

    router.push("/owner/users");
    router.refresh();
  }

  return (
    <main style={{ maxWidth: 640, padding: 16 }}>
      <h1>Add user</h1>
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          username
          <input value={username} onChange={(event) => setUsername(event.target.value)} required />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          password
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required />
        </label>

        <fieldset style={{ display: "grid", gap: 8 }}>
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

        {error ? (
          <p role="alert" style={{ margin: 0, color: "#b42318" }}>
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={loading || roles.length === 0}
          style={{ opacity: loading || roles.length === 0 ? 0.6 : 1, cursor: loading || roles.length === 0 ? "not-allowed" : "pointer" }}
        >
          {loading ? "Creating..." : "Create user"}
        </button>
      </form>
    </main>
  );
}

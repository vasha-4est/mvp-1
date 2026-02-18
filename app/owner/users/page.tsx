"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type UserItem = {
  user_id: string;
  login: string;
  is_active: boolean;
  roles: string[];
  last_login_at: string | null;
};

export default function OwnerUsersPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<{ userId: string; value: string } | null>(null);

  async function loadUsers() {
    setLoading(true);
    const response = await fetch("/api/owner/users", { cache: "no-store" });
    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload?.ok) {
      setError(payload?.error || "Failed to load users.");
      setLoading(false);
      return;
    }

    setUsers(Array.isArray(payload?.data?.users) ? payload.data.users : []);
    setError(null);
    setLoading(false);
  }

  async function toggleStatus(user: UserItem) {
    const nextStatus = user.is_active ? "disabled" : "active";
    const response = await fetch(`/api/owner/users/${encodeURIComponent(user.user_id)}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });

    if (!response.ok) {
      return;
    }

    setUsers((prev) =>
      prev.map((item) =>
        item.user_id === user.user_id
          ? {
              ...item,
              is_active: !user.is_active,
            }
          : item
      )
    );
  }

  async function resetPassword(user: UserItem) {
    const response = await fetch(`/api/owner/users/${encodeURIComponent(user.user_id)}/reset-password`, {
      method: "POST",
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload?.ok) {
      setError(payload?.error || "Failed to set/reset password");
      return;
    }

    const value = payload?.data?.temp_password;
    if (typeof value === "string") {
      setTempPassword({ userId: user.user_id, value });
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  return (
    <main style={{ padding: 16 }}>
      <h1>Owner / Users</h1>
      <p>
        <Link href="/owner/users/new">Add user</Link>
      </p>

      {tempPassword ? (
        <p style={{ padding: 8, border: "1px solid #f5c542", background: "#fff9e6" }}>
          Temporary password for <b>{tempPassword.userId}</b>: <code>{tempPassword.value}</code>
        </p>
      ) : null}

      {loading ? <p>Loading...</p> : null}
      {error ? <p role="alert">{error}</p> : null}

      {!loading && !error ? (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th align="left">username</th>
              <th align="left">status</th>
              <th align="left">roles</th>
              <th align="left">last_login_at</th>
              <th align="left">actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.user_id}>
                <td>{user.login}</td>
                <td>{user.is_active ? "active" : "disabled"}</td>
                <td>{user.roles.join(", ") || "—"}</td>
                <td>{user.last_login_at || "—"}</td>
                <td style={{ display: "flex", gap: 8 }}>
                  <Link href={`/owner/users/${encodeURIComponent(user.user_id)}`}>Edit</Link>
                  <button type="button" onClick={() => void toggleStatus(user)} style={{ cursor: "pointer" }}>
                    {user.is_active ? "Disable" : "Enable"}
                  </button>
                  <button type="button" onClick={() => void resetPassword(user)} style={{ cursor: "pointer" }}>
                    Set/Reset password
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </main>
  );
}

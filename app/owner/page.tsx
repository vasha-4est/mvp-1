import Link from "next/link";

export default function OwnerPage() {
  return (
    <main style={{ padding: 16 }}>
      <h1>Owner</h1>
      <ul>
        <li>
          <Link href="/owner/users">Users</Link>
        </li>
      </ul>
    </main>
  );
}

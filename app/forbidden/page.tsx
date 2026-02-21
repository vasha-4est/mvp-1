import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <main>
      <h1>403 Forbidden</h1>
      <p>You do not have access to this page.</p>
      <p>
        <Link href="/batches">Go to Batches</Link>
      </p>
    </main>
  );
}

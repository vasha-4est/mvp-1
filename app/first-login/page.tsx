import { redirect } from "next/navigation";

import { getSessionFromCookies } from "@/lib/server/rbac";

import FirstLoginForm from "./FirstLoginForm";

export default function FirstLoginPage({ searchParams }: { searchParams?: { next?: string } }) {
  const session = getSessionFromCookies();

  if (!session) {
    redirect("/login?next=%2Ffirst-login");
  }

  const nextPath = searchParams?.next ?? "/batches";

  return (
    <main data-testid="first-login-page" style={{ display: "grid", gap: 12, maxWidth: 420 }}>
      <h1>Set a new password</h1>
      <FirstLoginForm nextPath={nextPath} />
    </main>
  );
}

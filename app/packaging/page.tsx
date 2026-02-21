import { headers } from "next/headers";

import { requireAnyRole } from "@/lib/auth";
import { ALLOWED_ROLES } from "@/lib/server/controlModel";

function getRequestForPath(pathname: string): Request {
  const incomingHeaders = headers();
  const protocol = incomingHeaders.get("x-forwarded-proto") ?? "https";
  const host = incomingHeaders.get("x-forwarded-host") ?? incomingHeaders.get("host") ?? "localhost:3000";
  const cookieHeader = incomingHeaders.get("cookie") ?? "";
  const requestHeaders = new Headers();

  if (cookieHeader) {
    requestHeaders.set("cookie", cookieHeader);
  }

  return new Request(`${protocol}://${host}${pathname}`, {
    method: "GET",
    headers: requestHeaders,
  });
}

export default function PackagingPage() {
  const guard = requireAnyRole(getRequestForPath("/packaging"), [...ALLOWED_ROLES]);

  if (!guard.ok) {
    return (
      <main>
        <h1>Packaging Station</h1>
        <p role="alert">Access denied.</p>
        <small>request id: {guard.requestId}</small>
      </main>
    );
  }

  return (
    <main>
      <h1>Packaging Station</h1>
      <p>Coming soon.</p>
      <p>This is a safe read-only entry point for the upcoming packaging workflow.</p>
    </main>
  );
}

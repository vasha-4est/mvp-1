import { requirePageRole } from "@/lib/server/guards";

export default function PackagingStationPage() {
  requirePageRole("/packaging", ["OWNER", "COO"]);

  return (
    <main>
      <h1>Packaging Station</h1>
      <p>Coming soon.</p>
      <p>This is a safe read-only entry point for the upcoming packaging workflow.</p>
    </main>
  );
}

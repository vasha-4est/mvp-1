import { requirePageRole } from "@/lib/server/guards";

export default function ControlTowerPage() {
  requirePageRole("/control-tower", ["OWNER", "COO"]);

  return (
    <main>
      <h1>Control Tower</h1>
      <p>Coming soon.</p>
      <p>This is a safe read-only entry point for cross-stage monitoring and alerts.</p>
    </main>
  );
}

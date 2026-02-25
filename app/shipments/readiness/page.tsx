import { requirePageRole } from "@/lib/server/guards";

import ShipmentReadinessView from "@/components/shipments/ShipmentReadinessView";

/**
 * Smoke test (DevTools Console):
 * 1) Open /shipments/readiness in a PR-94 preview while logged in as OWNER/COO.
 * 2) Run the PR-94 smoke script from the task description to verify route 200, API shape,
 *    and table-or-empty-state rendering.
 */
export default function ShipmentsReadinessPage() {
  requirePageRole("/shipments/readiness", ["OWNER", "COO"]);

  return (
    <main>
      <ShipmentReadinessView />
    </main>
  );
}

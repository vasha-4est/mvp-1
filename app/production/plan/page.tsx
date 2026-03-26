import { requirePageRole } from "@/lib/server/guards";

import ProductionPlanView from "@/components/production/ProductionPlanView";

/**
 * Smoke test (DevTools Console):
 * 1) Open /production/plan while logged in as OWNER/COO.
 * 2) Confirm the summary cards and SKU table render from staged shipment plan + inventory coverage.
 * 3) Refresh the page and verify the plan remains read-only and deterministic.
 */
export default function ProductionPlanPage() {
  requirePageRole("/production/plan", ["OWNER", "COO"]);

  return (
    <main>
      <ProductionPlanView />
    </main>
  );
}

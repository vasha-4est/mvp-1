import { requirePageRole } from "@/lib/server/guards";

import ProductionPlanView from "@/components/production/ProductionPlanView";

/**
 * Smoke test (DevTools Console):
 * 1) Open /production/plan while logged in as OWNER/COO.
 * 2) Confirm the summary cards and launch table render from staged shipment plan + inventory coverage.
 * 3) Assign a worker, take one SKU into work, and change status; verify the same state remains after refresh.
 */
export default function ProductionPlanPage() {
  requirePageRole("/production/plan", ["OWNER", "COO"]);

  return (
    <main>
      <ProductionPlanView />
    </main>
  );
}
